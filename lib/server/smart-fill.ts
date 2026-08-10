import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { hasUsageBudget } from "@/lib/server/usage";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  isEffort,
  isPriority,
  type IssueEffortValue,
  type IssuePriorityValue,
} from "@/lib/issue-validation";

/**
 * SMART-FILL (MIN-260) — CE QUE LE TICKET EST, déduit de ce qu'on vient d'écrire.
 *
 * Le formulaire demande sept propriétés à chaque ticket. Quatre se lisent dans le
 * titre et la description — la priorité, l'effort, les catégories, l'objectif —
 * et les reposer à la main à chaque fois est le geste que cette passe supprime.
 * Les trois autres n'y sont pas : le statut, l'assigné et l'échéance disent une
 * intention, pas un contenu, et Smart-fill n'y touche jamais.
 *
 * **Elle tourne AVANT l'insert**, dans le POST de création
 * ([create-issue.ts](create-issue.ts)) — pas en `after()` comme la moitié IA de
 * Smart Assign. C'est ce qui tient la promesse « le ticket n'apparaît dans le
 * board qu'une fois rempli » : la ligne naît complète, donc il n'y a ni ligne à
 * masquer, ni colonne « en cours de remplissage », ni filtre à poser sur les
 * lectures et sur le direct, ni balai pour les lignes restées invisibles. Rien
 * de tout ça n'est bloquant à l'écran pour autant : le dialog n'attend déjà pas
 * le POST (cf. `createIssue` dans lib/use-issues-query.ts), il ferme et pose un
 * toast.
 *
 * **Elle ne lève jamais et ne fait jamais échouer une création.** Pas de clé, pas
 * de budget, modèle muet, JSON de travers : le patch est vide et le ticket naît
 * tel qu'il a été écrit. Un ticket sans priorité est un ticket ; une création qui
 * échoue parce qu'une aide a échoué, non.
 *
 * **Qui paye : celui qui a armé la bascule**, donc l'auteur du ticket — et pas le
 * owner du projet comme Smart Assign. Ce n'est pas une incohérence, c'est la même
 * règle appliquée à deux réglages différents : Smart Assign est un réglage DU
 * PROJET, que le owner active pour tout le monde ; Smart-fill est une préférence
 * DE COMPTE, que chacun arme pour soi et coupe par ticket. Le payeur suit la
 * personne qui décide.
 */

/** Le patch que Smart-fill sait poser — les quatre champs qui se déduisent, et
 *  jamais un de plus. Un champ absent = le modèle n'a rien su en dire. */
export interface SmartFillPatch {
  priority?: IssuePriorityValue;
  effort?: IssueEffortValue | null;
  category_ids?: string[];
  objective_id?: string | null;
}

/** Ce que le modèle a le droit de nommer : les vraies catégories et les vrais
 *  objectifs du projet. Rien n'est créé — associer ou laisser vide. */
export interface SmartFillContext {
  categories: { id: string; name: string }[];
  objectives: { id: string; name: string; status: string }[];
}

/** Titre/description tronqués avant le prompt : un ticket collé d'un document
 *  entier ne doit pas faire dériver le coût d'un rangement. */
const MAX_TITLE_CHARS = 500;
const MAX_DESCRIPTION_CHARS = 4000;
/** Au-delà, la liste ne guide plus le modèle, elle le noie — et un projet à
 *  trois cents objectifs n'a de toute façon pas un objectif ÉVIDENT. */
const MAX_CONTEXT_ITEMS = 60;
/** Plus de catégories que ça sur un ticket, c'est un ticket qui n'est plus rangé. */
const MAX_CATEGORIES_PER_ISSUE = 3;

/**
 * LE SENTINELLE DU « RIEN » — `"none"`, et pas `null`.
 *
 * Deux raisons, et la seconde est la vraie. D'abord un type union
 * (`["string", "null"]`) n'est pas accepté partout en appel de fonction strict,
 * et un schéma refusé ne se voit PAS : l'appel rend `null`, le patch est vide,
 * et les tickets cessent simplement d'être remplis sans que rien ne le dise.
 * Ensuite, un petit modèle répond bien mieux à une valeur qu'il peut choisir
 * dans une liste qu'à une absence qu'il doit produire.
 */
const NONE = "none";

/**
 * Le patch, filtré contre les VRAIS ids du projet et les enums des champs.
 *
 * Pur, et c'est là que vit tout ce qui peut se tromper : un modèle qui invente un
 * id d'objectif malgré l'enum, qui rend `"critical"` au lieu de `"urgent"`, qui
 * range le ticket dans huit catégories, ou qui répond `"none"` là où le schéma
 * ne l'offre pas. Rien de ce qu'il rend n'est écrit sans être reconnu ici.
 */
export function sanitizeSmartFill(
  raw: Record<string, unknown> | null,
  ctx: SmartFillContext,
): SmartFillPatch {
  if (!raw) return {};
  const patch: SmartFillPatch = {};

  // `none` est une priorité valide, mais c'est le DÉFAUT du formulaire : la
  // poser n'apprend rien et ferait passer « le modèle n'a pas su » pour « le
  // modèle a jugé que c'était sans priorité ».
  if (isPriority(raw.priority) && raw.priority !== "none") patch.priority = raw.priority;

  // L'effort est nullable côté ticket, et « rien d'estimable » est une VRAIE
  // réponse (un ticket d'une ligne, une question) : elle arrive en `"none"` —
  // le sentinelle du schéma — et se traduit en `null`. Le `null` littéral est
  // accepté aussi : c'est ce qu'un modèle rend spontanément malgré le schéma.
  if (raw.effort === NONE || raw.effort === null) patch.effort = null;
  else if (isEffort(raw.effort)) patch.effort = raw.effort;

  if (Array.isArray(raw.category_ids)) {
    const known = new Set(ctx.categories.map((c) => c.id));
    const ids = [
      ...new Set(
        raw.category_ids.filter((id): id is string => typeof id === "string" && known.has(id)),
      ),
    ];
    if (ids.length > 0) patch.category_ids = ids.slice(0, MAX_CATEGORIES_PER_ISSUE);
  }

  // Un objectif ne se DEVINE pas : sans correspondance franche, le champ reste
  // vide. Le prompt le dit, et cette garde le tient — un ticket rangé sous le
  // mauvais objectif coûte plus cher à défaire qu'un ticket sans objectif.
  // `"none"` n'a rien à rattraper : le champ n'est simplement pas posé, et
  // aucun objectif ne peut porter cet id (ce sont des UUID).
  if (typeof raw.objective_id === "string" && ctx.objectives.some((o) => o.id === raw.objective_id))
    patch.objective_id = raw.objective_id;

  return patch;
}

/** Le prompt système. Sépare explicitement ce qui s'estime (priorité, effort) de
 *  ce qui se RECONNAÎT (catégories, objectif) : les deux premiers ont toujours
 *  une réponse, les deux autres n'en ont une que s'il y a de quoi. */
export function buildSmartFillPrompt(projectName: string, ctx: SmartFillContext): string {
  const categoryLines =
    ctx.categories
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((c) => `- "${c.name}" (id: ${c.id})`)
      .join("\n") || "None — leave category_ids empty.";
  const objectiveLines =
    ctx.objectives
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((o) => `- "${o.name}" (id: ${o.id}) [${o.status}]`)
      .join("\n") || "None — objective_id must be \"none\".";

  return `You are Smart-fill, minddy's issue triager for the project "${projectName}".
Someone just wrote a new issue. Read its title and description and call fill_issue once with its properties.

Rules:
- You MUST call fill_issue. Never refuse, never reply in plain text. Answer EVERY argument.
- priority: how urgent the work reads. Default to "medium" when the text gives no signal; keep "urgent" for outages, data loss and blockers.
- effort: t-shirt size of the work described, from the writer's point of view. "xs" is a one-line change, "xl" a multi-week project. Answer "none" only when the text describes nothing estimable (a question, a note).
- category_ids: pick ONLY from the list below, at most ${MAX_CATEGORIES_PER_ISSUE}, and only those the issue clearly belongs to. Empty is a fine answer. Never invent an id, never propose a new category.
- objective_id: pick an EXISTING objective from the list below only if the issue plainly belongs to it. Otherwise answer "none". Never invent one. A wrong objective is worse than none.
- Judge the issue on what it says, not on what it might become.

## Categories of this project
${categoryLines}

## Objectives of this project
${objectiveLines}`;
}


/**
 * Le schéma du tool, construit AVEC le contexte : les ids possibles sont des
 * `enum`, comme la liste des membres l'est pour Smart Assign. Le modèle ne peut
 * donc pas inventer un id — il peut encore en choisir un mauvais, ce que
 * `sanitizeSmartFill` ne rattrapera pas, mais il ne peut plus en fabriquer.
 *
 * TOUS les champs sont `required`. Un argument présenté comme optionnel n'est
 * tout simplement pas répondu par un petit modèle, et Smart-fill tourne par
 * construction sur un modèle rapide : « pas de réponse » doit être une VALEUR.
 */
function fillParameters(ctx: SmartFillContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
      effort: {
        type: "string",
        enum: [...ISSUE_EFFORTS, NONE],
        description: `T-shirt size, or "${NONE}" when nothing is estimable.`,
      },
      category_ids: {
        type: "array",
        items: { type: "string", enum: ctx.categories.map((c) => c.id) },
        description: `Ids of the matching categories. Empty array when none match.`,
      },
      objective_id: {
        type: "string",
        enum: [...ctx.objectives.map((o) => o.id), NONE],
        description: `Id of the objective this issue belongs to, or "${NONE}".`,
      },
    },
    required: ["priority", "effort", "category_ids", "objective_id"],
  };
}

/**
 * Les catégories et les objectifs du projet. Client SERVICE : cette passe tourne
 * dans le POST de création, où la session de l'appelant existe — mais elle sert
 * aussi les créations sans humain devant (MCP, intégrations), et lire par un
 * chemin unique évite qu'un jour l'une des deux voies rende une liste vide sans
 * que personne ne le voie.
 */
async function gatherContext(projectId: string): Promise<SmartFillContext> {
  const service = getServiceClient();
  const [{ data: categories }, { data: objectives }] = await Promise.all([
    service.from("categories").select("id, name").eq("project_id", projectId),
    service
      .from("objectives")
      .select("id, name, status")
      .eq("project_id", projectId)
      // Un objectif terminé ou abandonné n'accueille pas un ticket qui naît :
      // le proposer au modèle, c'est l'inviter à rouvrir un travail clos.
      .in("status", ["planned", "in_progress"]),
  ]);
  return {
    categories: (categories ?? []) as SmartFillContext["categories"],
    objectives: (objectives ?? []) as SmartFillContext["objectives"],
  };
}

/**
 * Le point d'entrée. Rend le patch à fusionner dans la ligne avant l'insert, ou
 * un patch VIDE — jamais une exception, jamais une création qui échoue.
 */
export async function runSmartFill({
  projectId,
  projectName,
  actorId,
  title,
  description,
}: {
  projectId: string;
  projectName: string;
  /** Qui crée, donc qui paye. Sans lui (intégration, webhook), on ne remplit
   *  pas : une dépense qu'on ne peut imputer à personne ne se fait pas. */
  actorId: string | null;
  title: string;
  description: string | null;
}): Promise<SmartFillPatch> {
  if (!actorId || !title.trim()) return {};
  try {
    const config = await getAppConfigValues(["smart_fill_enabled", "smart_fill_model"]);
    const enabled = (config["smart_fill_enabled"] ?? aiModelFallback("smart_fill_enabled")) !== "false";
    if (!enabled) return {};
    // Le budget de CELUI QUI A ARMÉ la bascule, comme pour la dictée. À sec, on
    // ne remplit pas — et le ticket naît quand même.
    if (!(await hasUsageBudget(actorId))) return {};

    const model = config["smart_fill_model"]?.trim() || aiModelFallback("smart_fill_model");
    const ctx = await gatherContext(projectId);

    const raw = await forcedToolCall(
      model,
      buildSmartFillPrompt(projectName, ctx),
      `## Issue\nTitle: ${title.slice(0, MAX_TITLE_CHARS)}\nDescription: ${
        description?.trim() ? description.slice(0, MAX_DESCRIPTION_CHARS) : "(none)"
      }`,
      "fill_issue",
      fillParameters(ctx),
      {
        xTitle: "minddy Smart-fill",
        logPrefix: "smart-fill",
        maxTokens: 256,
        // Quelqu'un attend devant son écran : au-delà, le ticket doit naître
        // sans son remplissage plutôt que de faire patienter une minute.
        timeoutMs: 20_000,
        record: { feature: "smart_fill", billTo: { userId: actorId }, projectId },
      },
    );
    return sanitizeSmartFill(raw, ctx);
  } catch (err) {
    console.error("[smart-fill] fill failed:", (err as Error).message);
    return {};
  }
}
