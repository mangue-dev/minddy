import {
  ISSUE_TOOL_NAMES,
  PR_TOOL_NAMES,
  PROJECT_PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "../platform-tool-names";
import { agentToolsFor, type AgentToolDef } from "../tools";
import { OPENCODE_TOOL_DIR } from "./opencode-config";
import type { VmJob } from "./protocol";

/**
 * LES TOOLS DE DOMAINE, ÉCRITS POUR OPENCODE (MIN-286, lot 1) — les ~35 tools
 * qui ne cessent PAS d'être notre code, rendus dans la forme qu'opencode charge.
 *
 * LA RÈGLE DU FICHIER, et c'est elle qui décide de tout le reste : **il n'y a pas
 * de deuxième table**. Les schémas, les descriptions, le ciblage par ancrage
 * (`TARGET_SUFFIX`), les retraits structurels (`web_search` hors OpenRouter,
 * `report_verdict` hors chaîne, `create_routine` hors session interactive)
 * viennent d'`agentToolsFor` ([tools.ts](../tools.ts)) — les MÊMES définitions
 * qu'aujourd'hui, rendues autrement. Recopier ces schémas ici aurait créé deux
 * vérités qui divergent au premier ticket, et la divergence ne se verrait que
 * dans le comportement d'un modèle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ SUR `opencode-ai@1.18.16`, et qui n'est écrit nulle part
 *
 * 1. **Un tool se déclare en TypeScript, et deux formes sont acceptées — une
 *    seule est utilisable.** L'objet nu (`export default { description, args,
 *    execute }`) traite `args` comme une carte *nom → schéma*, et **rend TOUT
 *    obligatoire** : passer un JSON Schema complet y produit un schéma absurde
 *    (`required: ["properties", "additionalProperties"]`, mesuré) que le modèle
 *    reçoit tel quel. La forme `tool({...})` de `@opencode-ai/plugin`, elle,
 *    accepte `tool.schema` (zod) avec `.optional()` et `.enum()`, et rend le
 *    schéma exact. **Nos tools ont des paramètres optionnels partout** : c'est
 *    donc `tool()`, et c'est pour ça que ce module ÉMET DU CODE zod plutôt que
 *    de recopier un JSON Schema.
 * 2. **`@opencode-ai/plugin` n'a pas à être installé** : le runtime TypeScript du
 *    binaire le résout seul. Aucun `node_modules` à poser dans la microVM.
 * 3. **Les tools peuvent vivre HORS DU DÉPÔT** — `$XDG_CONFIG_HOME/opencode/tool/`
 *    est chargé comme `.opencode/tool/` du projet (mesuré : servi ET appelé).
 *    C'est indispensable, pas une préférence : dans le dépôt, ils entreraient
 *    dans le `git add -A` de fin de tour et se retrouveraient commités chez
 *    l'utilisateur. D'où `OPENCODE_TOOL_DIR`, sous `HARNESS_DIR`.
 * 4. **`process.env` est lisible depuis un tool** (mesuré) — c'est par là que
 *    l'adresse du superviseur descend, sans qu'aucune valeur ne soit écrite en
 *    dur dans le code généré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE TOOL PASSE PAR LE SUPERVISEUR, ET NON DIRECTEMENT PAR LE PLAN DE
 * CONTRÔLE
 *
 * Le cadrage disait « chacun un `fetch` vers le plan de contrôle ». Un saut local
 * de plus tient la même garantie — c'est le superviseur qui fait l'appel sortant,
 * donc l'identité reste prouvée par l'OIDC du firewall, et aucun secret n'entre
 * dans la VM — et il rend trois choses qu'un appel direct rendrait impossibles :
 *
 * - **les compteurs de TOUR** : le plafond de recherches web
 *   (`webSearchMax`), le plafond d'images (`MAX_IMAGES_PER_TURN`) et les ancres
 *   de review déjà posées sont des états du tour. Un tool sans mémoire les
 *   perdrait, et le plan de contrôle ne compte rien — il facture ce qu'on lui
 *   demande ;
 * - **`create_pr`**, qui est coupé en deux par construction : la VM POUSSE, la
 *   fonction OUVRE. Seul le superviseur a le dépôt ;
 * - **les règles de livraison** (gate, self-review, plan closure), qui doivent
 *   voir passer les appels.
 *
 * Le code généré, lui, ne sait rien de tout ça : il poste un JSON et rend ce
 * qu'on lui répond. C'est le point — un tool généré qui contient de la logique
 * est un tool qu'on maintient en deux exemplaires.
 */

/** L'en-tête posé sur chaque fichier généré : personne ne l'édite à la main. */
const HEADER = `// Généré par lib/server/agent/vm/opencode-tools.ts — NE PAS ÉDITER.\n// MIN-286 : ce fichier est réécrit à chaque tour depuis les définitions de tools.ts.\n`;

/**
 * La variable qui porte l'adresse du superviseur. Lue par le code généré, posée
 * par le superviseur au démarrage : le port est choisi à l'exécution, il ne peut
 * donc pas être écrit dans le fichier.
 */
export const SUPERVISOR_URL_ENV = "MDY_SUPERVISOR_URL";

/**
 * L'EN-TÊTE QUI DIT « CETTE RÉPONSE PORTE UNE IMAGE » (MIN-286, lot 3).
 *
 * Le pont répond du TEXTE dans l'écrasante majorité des cas, et le tool généré le
 * rend tel quel. Une seule réponse ne rentre pas là-dedans : `read_resource` sur
 * une maquette, qui doit devenir une **pièce jointe** de message pour que le
 * modèle la VOIE au lieu d'en lire la fiche signalétique (mesuré, dossier §2.22).
 *
 * On l'annonce par un en-tête plutôt que par la forme du corps : c'est le seul
 * moyen de distinguer les deux sans qu'un tool de domaine qui rendrait, lui,
 * légitimement un objet `{output, attachments}` ne soit pris pour une enveloppe.
 * Les deux chemins existants ne bougent donc pas d'un octet.
 */
export const TOOL_ATTACHMENTS_HEADER = "x-minddy-attachments";

/**
 * Les tools qui deviennent des tools de DOMAINE, c'est-à-dire ceux dont
 * l'exécution vit côté serveur. Dérivés des `Set` de routage
 * ([platform-tool-names.ts](../platform-tool-names.ts)) plutôt que réécrits :
 * ce sont les mêmes noms que `exec-tool.ts` route aujourd'hui.
 *
 * Les trois ajouts, et pourquoi chacun n'est pas dans ces `Set` :
 *  - `create_pr` — coupé en deux (la VM pousse, la fonction ouvre) ;
 *  - `web_search` — facturé et plafonné par nous, et de toute façon pas servi
 *    par opencode sur OpenRouter ;
 *  - `ask_user` n'y est PAS : il a un vis-à-vis natif (`question`), que le
 *    superviseur branche sur notre file de questions.
 *
 * `update_plan` n'y est PLUS : il n'a jamais eu de handler côté serveur (c'est
 * un tool de CONTRÔLE, que la boucle maison exécutait elle-même sans sortir),
 * donc chaque appel repartait en `404: unknown platform tool: update_plan` — la
 * checklist du fil restait vide sur tous les runs opencode. Il est passé aux
 * tools LOCAUX, où il aurait dû être dès le départ.
 */
export const DOMAIN_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ISSUE_TOOL_NAMES,
  ...SCRATCHPAD_TOOL_NAMES,
  ...PR_TOOL_NAMES,
  ...PROJECT_PR_TOOL_NAMES,
  "create_pr",
  "web_search",
]);

/**
 * LES TOOLS LOCAUX — ceux que le SUPERVISEUR exécute dans la microVM, sans jamais
 * sortir d'elle (MIN-286, lot 3 ; dossier §3.2).
 *
 * `update_plan` en est, et c'est ce qui manquait : c'est un tool de CONTRÔLE,
 * pas de domaine. Il n'exécute rien — il émet l'event `plan_update` que le fil
 * rend en checklist, et miroite les états vers le plan du ticket. La boucle
 * maison le traitait ainsi ([agent-loop.ts](../agent-loop.ts)) ; rangé côté
 * domaine, il partait au plan de contrôle, qui n'a jamais eu de handler à lui
 * opposer — 404 à chaque appel, checklist morte.
 *
 * `run_background` était le seul jusque-là : `bash` n'a pas de mode fond, et le registre de
 * jobs d'opencode sert `task`, pas le shell. Le repli qui tenait jusqu'ici — dire
 * au modèle de lancer son serveur en `&` dans le shell persistant — portait la
 * doctrine (« fais tourner le code pour de vrai ») sans aucun de ses garde-fous :
 * rien ne tuait le serveur avant le `git add -A`, sa sortie n'était bornée par
 * personne, et `checkCommand` ne voyait pas passer la commande. Le tool est donc
 * reposé, et c'est [background.ts](../background.ts) inchangé qui le tient — la
 * politique est pure, seul le câblage est neuf.
 *
 * Il traverse le même pont que les tools de domaine : le fichier généré est
 * identique, c'est le pont qui l'exécute au lieu de le faire suivre.
 */
export const LOCAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  "run_background",
  "update_plan",
]);

/**
 * Les tools de domaine SERVIS par ce tour, avec leurs descriptions déjà taillées
 * à son ancrage. `agentToolsFor` fait tout le travail — on ne garde que ceux dont
 * l'exécution nous revient, les autres étant rendus par opencode.
 */
export function domainToolsFor(job: VmJob): AgentToolDef[] {
  return toolsFor(job).filter((t) => DOMAIN_TOOL_NAMES.has(t.function.name));
}

/**
 * Les tools LOCAUX servis par ce tour. Le superviseur s'en sert pour ne câbler
 * `run_background` que là où il est offert — une session de relecture ne lance
 * rien en fond, et un tool routé sans être servi est un tool qu'on maintient pour
 * personne.
 */
export function localToolsFor(job: VmJob): AgentToolDef[] {
  return toolsFor(job).filter((t) => LOCAL_TOOL_NAMES.has(t.function.name));
}

/**
 * Tout ce qu'on ÉCRIT dans le dossier de tools : domaine + local. Une session de
 * relecture n'a pas `run_background` (`PR_REVIEW_TOOLS` ne le porte pas), et c'est
 * `agentToolsFor` qui le dit — pas une deuxième condition ici.
 */
function bridgedToolsFor(job: VmJob): AgentToolDef[] {
  return toolsFor(job).filter(
    (t) => DOMAIN_TOOL_NAMES.has(t.function.name) || LOCAL_TOOL_NAMES.has(t.function.name),
  );
}

function toolsFor(job: VmJob): AgentToolDef[] {
  return agentToolsFor({
    anchor: job.anchor,
    webSearch: job.webSearch,
    webSearchMax: job.webSearchMax,
    model: job.model,
    images: job.imageInput,
    subagentModels: job.subagents.models,
    chain: job.chain,
    interactive: job.interactive,
  });
}

type JsonSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, unknown>;
  required?: string[];
};

/** `"a\nb"` → une littérale TypeScript sûre. `JSON.stringify` échappe tout. */
function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * Un schéma JSON, rendu en expression `tool.schema.…`.
 *
 * Ce que ce traducteur couvre est exactement ce que `tools.ts` emploie —
 * `string`, `number`, `boolean`, `array` (avec `items`), `object` (imbriqué),
 * `enum`, `description`. Le reste **lève**, et c'est délibéré : un schéma qu'on
 * ne sait pas traduire deviendrait sinon un `any` silencieux, donc un tool dont
 * le modèle ne connaît plus la forme. Une erreur au démarrage du tour se voit ;
 * un paramètre disparu, non.
 */
export function schemaExpression(schema: JsonSchema, path = "args"): string {
  const describe = (expr: string) =>
    schema.description ? `${expr}.describe(${literal(schema.description)})` : expr;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    // Les enums de `tools.ts` sont tous des chaînes ; un enum d'autre chose
    // n'aurait pas de traduction évidente, et il vaut mieux le savoir ici.
    if (!schema.enum.every((v) => typeof v === "string")) {
      throw new Error(`${path}: enum non textuel, sans traduction`);
    }
    return describe(`tool.schema.enum(${JSON.stringify(schema.enum)})`);
  }

  switch (schema.type) {
    case "string":
      return describe("tool.schema.string()");
    case "number":
    case "integer":
      return describe("tool.schema.number()");
    case "boolean":
      return describe("tool.schema.boolean()");
    case "array": {
      if (!schema.items) throw new Error(`${path}: tableau sans \`items\``);
      return describe(`tool.schema.array(${schemaExpression(schema.items, `${path}[]`)})`);
    }
    case "object": {
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const entries = Object.entries(properties).map(([name, raw]) => {
        const inner = schemaExpression(raw as JsonSchema, `${path}.${name}`);
        return `    ${JSON.stringify(name)}: ${inner}${required.has(name) ? "" : ".optional()"},`;
      });
      return describe(`tool.schema.object({\n${entries.join("\n")}\n  })`);
    }
    default:
      throw new Error(`${path}: type ${String(schema.type)} sans traduction`);
  }
}

/** La carte `args` d'un tool : une propriété par ligne, optionnelle sauf requise. */
function argsBlock(def: AgentToolDef): string {
  const { properties, required } = def.function.parameters;
  const req = new Set(required ?? []);
  const entries = Object.entries(properties).map(([name, raw]) => {
    const expr = schemaExpression(raw as JsonSchema, `${def.function.name}.${name}`);
    return `    ${JSON.stringify(name)}: ${expr}${req.has(name) ? "" : ".optional()"},`;
  });
  return entries.length ? `{\n${entries.join("\n")}\n  }` : "{}";
}

/**
 * LE FICHIER D'UN TOOL. Toujours la même forme, à la description et au schéma
 * près : il poste, il rend.
 *
 * `JSON.stringify` du résultat, et pas une mise en forme : c'est ce que la boucle
 * fait déjà aujourd'hui côté modèle, et une deuxième mise en forme ici serait une
 * deuxième chose à garder en phase avec l'autre moteur pendant la bascule.
 *
 * Un échec de transport n'est PAS une exception qui remonte : le modèle doit lire
 * l'erreur et pouvoir réessayer ou faire autrement. Un tool qui lève coupe le
 * round, ce qui est la manière la plus chère de dire « réessaie ».
 *
 * LA SEULE BRANCHE : l'en-tête `TOOL_ATTACHMENTS_HEADER`, qui annonce une image
 * (`read_resource` sur une maquette). Le corps est alors une **enveloppe**
 * `{output, attachments}` que le tool rend telle quelle — c'est la forme riche du
 * `ToolResult` d'`@opencode-ai/plugin`, et opencode la transforme en une partie
 * `image_url` d'un message `user` posé après le round (mesuré, dossier §2.22).
 * Une enveloppe illisible retombe sur le texte : une maquette perdue vaut mieux
 * qu'un round perdu.
 */
export function renderOpencodeTool(def: AgentToolDef): string {
  const name = def.function.name;
  return `${HEADER}import { tool } from "@opencode-ai/plugin";

export default tool({
  description: ${literal(def.function.description)},
  args: ${argsBlock(def)},
  async execute(args, ctx) {
    const base = process.env[${literal(SUPERVISOR_URL_ENV)}];
    if (!base) return "minddy tool bridge is not configured for this turn.";
    try {
      const res = await fetch(base + "/tool/" + ${literal(name)}, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args, callID: ctx?.callID, sessionID: ctx?.sessionID }),
        signal: ctx?.abort,
      });
      const text = await res.text();
      if (!res.ok) return "minddy tool ${name} failed (HTTP " + res.status + "): " + text.slice(0, 500);
      if (res.headers.get(${literal(TOOL_ATTACHMENTS_HEADER)})) {
        try {
          const envelope = JSON.parse(text);
          if (envelope && typeof envelope.output === "string" && Array.isArray(envelope.attachments)) {
            return { output: envelope.output, attachments: envelope.attachments };
          }
        } catch {}
      }
      return text;
    } catch (err) {
      return "minddy tool ${name} could not reach the harness: " + (err instanceof Error ? err.message : String(err));
    }
  },
});
`;
}

/** Un fichier à écrire dans la microVM : chemin absolu et contenu. */
export interface OpencodeToolFile {
  path: string;
  content: string;
}

/**
 * TOUS les tools de domaine d'un tour, prêts à écrire. Le superviseur pose ce
 * tableau tel quel avant de démarrer le serveur.
 *
 * Le nom de fichier EST le nom du tool : c'est ce qu'opencode enregistre, et le
 * faire diverger reviendrait à servir `read_issue` sous le nom `read-issue.ts`.
 */
export function opencodeToolFiles(job: VmJob): OpencodeToolFile[] {
  return bridgedToolsFor(job).map((def) => ({
    path: `${OPENCODE_TOOL_DIR}/${def.function.name}.ts`,
    content: renderOpencodeTool(def),
  }));
}
