import {
  renderSubagentPrompt,
  SubagentTemplateError,
  SUBAGENT_TEMPLATE_IDS,
} from "./subagent-templates";
import {
  SUBAGENT_THINKING_EFFORTS,
  type FavoriteSubagentModel,
  type SubagentThinkingEffort,
} from "@/lib/subagent-favorites";
import type { AgentChatMessage } from "./agent-loop";

/**
 * Sous-agents de l'agent de code (MIN-112) : déléguer un morceau de travail défini
 * à une session fille qui a son propre contexte, et n'en récupérer qu'un RAPPORT.
 *
 * Ce module est PUR (comme `background.ts`) : la POLITIQUE vit ici — plafond de
 * parallélisme, exclusivité de l'écrivain, registre, livraison des rapports une
 * seule fois, coupe en fin de chunk — et se teste sans microVM ni base. Les MAINS
 * (un second appel de `runAgentLoop` dans la même sandbox) sont derrière
 * `SubagentRunner`, câblé dans `execute.ts`.
 *
 * Les trois contraintes qui ont dessiné tout ce qui suit :
 *
 * 1. **La sandbox est PARTAGÉE.** Chez Codex chaque agent voit le disque de
 *    l'utilisateur ; ici, deux écrivains simultanés se marchent dessus dans un
 *    dépôt dont la fin de tour fait `git add -A`. D'où : un seul `implement` en
 *    vol — et le PARENT compte comme écrivain (cf. `PARENT_WRITE_TOOLS`).
 * 2. **Le budget se compte par `ai_usage.user_id`.** Le runner passe le
 *    `runId`/`billTo`/`projectId` du parent, dans la bande de seq dédiée
 *    `SUBAGENT_USAGE_SEQ_BASE` — et le coût REMONTE dans l'accumulateur de la
 *    boucle parente, sinon `budgetUsd` sous-compte et le run dépasse son budget.
 * 3. **La soft-deadline est celle du parent.** Un sous-agent en vol quand le chunk
 *    se termine est COUPÉ : son rapport partiel est livré, pas perdu.
 */

export type SubagentMode = "explore" | "implement";

/**
 * Le niveau de réflexion d'un sous-agent (`reasoning_effort` d'OpenAI, cf.
 * `lib/agent-reasoning.ts`) et la forme d'un favori vivent dans
 * `lib/subagent-favorites.ts` : le dashboard admin ÉDITE ces favoris, et le
 * client ne peut pas importer ce module-ci. Ré-exportés pour que les appelants
 * serveur gardent un seul point d'entrée. `off` n'est PAS un niveau exposé : un
 * sous-agent sans réflexion sur un modèle raisonneur saute ses vérifications, et
 * il n'a pas de tour suivant pour se rattraper.
 */
export type { FavoriteSubagentModel, SubagentThinkingEffort };

const MODES: ReadonlySet<string> = new Set<SubagentMode>(["explore", "implement"]);
const EFFORTS: ReadonlySet<string> = new Set<string>(SUBAGENT_THINKING_EFFORTS);

/**
 * `suspended` = la fille n'a pas fini, mais son état est SAUVÉ : elle repartira au
 * chunk suivant, là où elle s'est arrêtée. C'est ce qui lui permet de dépasser les
 * 300 s de la fonction Vercel (cf. `SubagentRecord.messages`).
 *
 * `cut` reste pour la mort SANS reprise (erreur du chunk, run qui s'arrête) : le
 * rapport partiel est livré une fois, et on n'y revient pas.
 */
export type SubagentStatus = "running" | "suspended" | "done" | "error" | "cut";

/**
 * Ce qu'on garde d'un sous-agent — y compris dans le checkpoint, pour que
 * `agent_status` / `list_agents` répondent honnêtement après un suspend au lieu de
 * dire « inconnu » sur un sous-agent que l'agent vient de lancer.
 */
export interface SubagentRecord {
  id: string;
  task: string;
  mode: SubagentMode;
  /** Modèle forcé, ou null = celui du parent. */
  model: string | null;
  thinkingEffort: SubagentThinkingEffort | null;
  status: SubagentStatus;
  /** Rounds consommés par la boucle fille (avance en direct via `bumpRounds`). */
  rounds: number;
  /** Rapport final, ou partiel si le sous-agent a été coupé. */
  report?: string;
  /** Dépense CUMULÉE de la fille, tous chunks confondus (cf. `costSoFar`). */
  costUsd: number;
  /**
   * Part de `costUsd` DÉJÀ imputée à `run.cost_usd` (MIN-202). Voyage dans le
   * checkpoint avec le reste du record : c'est ce qui permet d'imputer la dépense
   * d'une fille suspendue au chunk où elle a lieu, sans la repayer à la livraison —
   * `costUsd` étant cumulatif, l'ajouter tel quel double-compterait.
   */
  costBilled?: number;
  /** Epoch ms — sérialisable, contrairement à une Date. */
  startedAt: number;
  /** Le rapport a-t-il DÉJÀ été livré au parent ? (jamais deux fois). */
  delivered: boolean;
  /**
   * Historique de la boucle FILLE, persisté UNIQUEMENT quand elle est `suspended`.
   *
   * C'est toute l'astuce de la reprise : la microVM, elle, survit déjà au chunk
   * (session de 45 min, snapshot persistant de 7 jours) — ce qui meurt à la fin
   * d'une fonction Vercel, c'est l'état EN MÉMOIRE de la boucle. En le posant dans
   * le checkpoint, on donne à la fille exactement ce que le parent a depuis
   * toujours, et elle peut alors dépasser les 300 s.
   */
  messages?: AgentChatMessage[];
  /** Où en était son compteur `ai_usage` : la reprise continue la même bande. */
  usageSeq?: number;
  /** Tool-call `spawn_agent` d'origine — les events de la reprise restent repliés
   *  sous la MÊME ligne du fil qu'avant la coupure. */
  parentCallId?: string;
  /** Ce que son rapport doit contenir, rappelé à la reprise. */
  expectedOutput?: string;
  /** Slot d'origine : la bande de seq `ai_usage` ne doit pas bouger à la reprise. */
  slot?: number;
}

/** Cap du rapport servi au parent dans un message. */
export const SUBAGENT_REPORT_MAX_CHARS = 8_000;
/** Cap du rapport PERSISTÉ dans le checkpoint (il y en a un par sous-agent). */
export const SUBAGENT_RECORD_REPORT_MAX_CHARS = 2_000;
/** Cap de la tâche recopiée dans les records / events (le prompt complet vit ailleurs). */
const TASK_MAX_CHARS = 500;
/**
 * Records PERSISTÉS dans le checkpoint, les plus récents. Sans cap, un run de vingt
 * continuations qui délègue à chaque tour accumulerait quatre cents records dans le
 * checkpoint : il finirait par franchir `MAX_CHECKPOINT_BYTES` (8 Mo) et le
 * garde-fou anti-runaway couperait le tour — pour un historique dont personne ne se
 * sert au-delà des derniers.
 */
const SUBAGENT_RECORDS_KEPT = 20;

/**
 * Sous-agents lançables sur UN chunk, toutes vagues confondues (le plafond de
 * `maxParallel` ne borne que le simultané). Garde-fou anti-runaway : un agent qui
 * délègue trente fois dans un tour a perdu le fil, et chaque lancement est payant.
 */
export const MAX_SUBAGENTS_PER_CHUNK = 20;

/** Délai de grâce laissé à une fille pour rendre son rapport partiel après abort. */
const CUT_GRACE_MS = 5_000;
/** Cadence de la sonde « l'utilisateur a-t-il écrit ? » pendant une attente. Une
 *  requête indexée toutes les 3 s : assez réactif pour un humain qui s'impatiente,
 *  assez espacé pour ne pas peser sur une attente de plusieurs minutes. */
const STEERING_POLL_MS = 3_000;

/**
 * Base des seq `ai_usage` des appels d'un sous-agent — à côté de
 * `SANDBOX_USAGE_SEQ_BASE` (1e9) et `WEB_SEARCH_SEQ_BASE` (1,5e9). Le `feature`
 * est CELUI DE SA MÈRE : `agent_code` d'ordinaire, `routine_code` quand le run
 * parent est un passage de routine (MIN-185) — une fille lancée par une routine
 * est une dépense de cette routine, et la ranger ailleurs ferait mentir la
 * ligne « Routines » de la facture. Le modèle réellement utilisé étant déjà
 * écrit par ligne, le coût d'un sous-agent reste isolable en SQL.
 */
export const SUBAGENT_USAGE_SEQ_BASE = 2_000_000_000;
/** Seq réservés à UN sous-agent (rounds + compactions). */
const SUBAGENT_SEQ_SPAN = 1_000;
/** `ai_usage.seq` est un `integer` Postgres : hors bornes, l'INSERT est REJETÉ. */
const MAX_PG_INT = 2_147_483_647;

/**
 * Seq de départ des lignes d'usage du sous-agent n° `slot` du run. L'espacement est
 * BORNÉ : au-delà, on retombe sur le dernier slot représentable plutôt que d'écrire
 * un entier hors bornes — deux sous-agents partageraient alors une plage de seq (un
 * ordre d'affichage ambigu), là où un dépassement perdrait la ligne d'usage entière.
 */
export function subagentUsageSeq(slot: number): number {
  const s = Number.isFinite(slot) ? Math.max(0, Math.floor(slot)) : 0;
  const room = MAX_PG_INT - SUBAGENT_USAGE_SEQ_BASE - SUBAGENT_SEQ_SPAN;
  return SUBAGENT_USAGE_SEQ_BASE + Math.min(s * SUBAGENT_SEQ_SPAN, room);
}

/**
 * Tools du parent qui TOUCHENT À L'ARBRE, GELÉS tant qu'un sous-agent `implement`
 * est en vol.
 *
 * Ce n'est pas de la prudence en trop : le parent qui continue d'éditer pendant
 * qu'une fille écrit est exactement le même risque que deux filles simultanées, dans
 * un dépôt dont la fin de tour fait `git add -A`. La lecture et `run_command`
 * restent ouverts — le parent peut relire, chercher, lancer les tests.
 *
 * `create_pr` est dans la liste pour la RAISON INVERSE, et c'est ce qui la rend
 * facile à oublier : il n'écrit rien, il fait son propre `git add -A`. Le parent
 * dont les tools d'édition viennent d'être refusés se dit volontiers qu'il peut au
 * moins ouvrir la PR — et commite la fille au milieu de son geste : le composant
 * neuf sans ses clés i18n, un `move_file` à moitié fait. Le commit part, la branche
 * est créée, la CI tourne sur cet arbre-là (MIN-209).
 */
export const PARENT_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "edit_file",
  "apply_edits",
  "write_file",
  "apply_patch",
  "move_file",
  "delete_file",
  "create_pr",
]);

/** Ce que le runner reçoit pour faire tourner UNE session fille. */
export interface SubagentRunOptions {
  id: string;
  /** Id du tool-call `spawn_agent` : les events de la fille le portent, et le fil
   *  les replie SOUS cette ligne au lieu d'ouvrir une bulle par event. */
  parentCallId?: string;
  mode: SubagentMode;
  /** Tâche brute (pour les libellés et le record). */
  task: string;
  /** Prompt de cadrage rendu (template + tâche), servi comme message utilisateur. */
  prompt: string;
  expectedOutput: string;
  /** Modèle forcé, ou null = celui du parent. */
  model: string | null;
  thinkingEffort: SubagentThinkingEffort | null;
  /** Numéro de slot du run → bande de seq `ai_usage` (cf. `subagentUsageSeq`). */
  slot: number;
  signal: AbortSignal;
  /**
   * L'abandon en cours est-il une SUSPENSION (fin de chunk, on reprendra) plutôt
   * qu'une mise à mort ? Le signal d'abort est le même dans les deux cas ; c'est
   * l'INTENTION qui diffère, et elle décide de ce que le runner fait de l'historique :
   * le sauver pour la reprise, ou en tirer un rapport partiel définitif.
   */
  isSuspending: () => boolean;
  /** Appelé à chaque round de la fille : `agent_status` doit dire autre chose que 0. */
  onRound: () => void;
  /**
   * REPRISE : l'historique laissé par le chunk précédent. Présent = la fille
   * continue son travail au lieu de le recommencer, et le runner ne réamorce ni
   * son prompt système ni sa tâche (ils sont déjà dedans).
   */
  resumeMessages?: AgentChatMessage[];
  /** REPRISE : où reprendre la bande de seq `ai_usage` de cette fille. */
  resumeUsageSeq?: number;
  /** Rounds déjà consommés par les chunks précédents (le plafond est cumulatif). */
  roundsSoFar?: number;
  /** Coût déjà accumulé par les chunks précédents (le rapport doit le totaliser). */
  costSoFar?: number;
}

export interface SubagentRunResult {
  /** Rapport texte — le SEUL livrable d'un sous-agent. Vide si `suspended`. */
  report: string;
  rounds: number;
  costUsd: number;
  /**
   * `suspended` = pas fini, mais SAUVÉ (cf. `messages`) : elle repart au chunk
   * suivant. `cut` = pas fini et pas sauvé : rapport partiel livré une fois.
   */
  status: "done" | "error" | "cut" | "suspended";
  /** Historique à persister quand `status === "suspended"`. */
  messages?: AgentChatMessage[];
  /** Compteur `ai_usage` atteint, à reprendre au chunk suivant. */
  usageSeq?: number;
}

/** Les mains dans la microVM (implémentées par `execute.ts`). */
export interface SubagentRunner {
  run(opts: SubagentRunOptions): Promise<SubagentRunResult>;
}

/** Forme d'un résultat de tool (identique au contrat de `ExecuteAgentTool`). */
interface ToolOutcome {
  result: unknown;
  success: boolean;
  reason?: string;
}

function fail(error: string, reason?: string): ToolOutcome {
  return { result: { error }, success: false, ...(reason ? { reason } : {}) };
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** Étiquette d'échec portée par `tool_result` quand le verrou d'écriture refuse. */
export const SUBAGENT_WRITE_LOCKED_REASON = "subagent_write_locked";
/** Étiquette d'échec quand le parallélisme (ou le total du chunk) est saturé. */
export const SUBAGENT_LIMIT_REASON = "subagent_limit";

/**
 * Ce que le parent LIT quand un rapport lui revient. Le format compte : c'est la
 * seule chose qu'il aura de tout le travail de la fille, et il doit pouvoir décider
 * s'il fait confiance au résumé ou s'il va relire lui-même (d'où les métadonnées :
 * état, rounds, modèle).
 */
export function formatSubagentReport(
  record: SubagentRecord,
  opts: { stillRunning: number },
): string {
  const state =
    record.status === "done"
      ? "finished"
      : record.status === "error"
        ? "FAILED (the report below is whatever it managed to produce)"
        : "was CUT OFF before finishing (the turn ran out of time — the report below is PARTIAL)";

  const model = record.model ? `\nModel: ${record.model}` : "";
  const effort = record.thinkingEffort ? `\nThinking effort: ${record.thinkingEffort}` : "";
  const others =
    opts.stillRunning > 0
      ? `\n\n${opts.stillRunning} of your sub-agents ${opts.stillRunning === 1 ? "is" : "are"} still running; you will be told when they finish.`
      : "";
  const writeLock =
    record.mode === "implement"
      ? "\n\nYour own editing tools are available again, and so is create_pr."
      : "";

  return `[sub-agent ${record.id}] Your ${record.mode} sub-agent ${state}.

Task: ${cap(record.task, TASK_MAX_CHARS)}
Steps: ${record.rounds}${model}${effort}

--- Report from ${record.id} ---
${cap(record.report?.trim() || "(the sub-agent returned nothing)", SUBAGENT_REPORT_MAX_CHARS)}
--- End of report ---

You did not wait for this: it came back on its own. It is a SUMMARY written by another session — if a claim matters, verify it in the repository yourself.${writeLock}${others}`;
}

/** Un sous-agent en vol, avec sa promesse (jamais sérialisée). */
interface Job {
  record: SubagentRecord;
  controller: AbortController;
  /** Résolue quand la fille a rendu la main (jamais rejetée : le lancement l'avale). */
  settled: Promise<void>;
  /** L'abort en cours est une SUSPENSION (fin de chunk), pas une mise à mort : le
   *  runner doit sauver l'historique au lieu de rendre un rapport partiel. */
  suspending: boolean;
}

export interface SubagentsOptions {
  /** Sous-agents simultanés (calculé au lancement, cf. `subagent-config.ts`). */
  maxParallel: number;
  /** Favoris servis dans les messages d'erreur de modèle. */
  favorites: FavoriteSubagentModel[];
  /**
   * Résout le champ `model` : un favori (par id ou par libellé) ou un id du
   * catalogue du run. Absent = le run n'offre pas le choix du modèle (BYOK
   * non-OpenRouter) → le champ est refusé et la fille hérite du modèle du parent.
   */
  resolveModel?: (raw: string) => { ok: true; id: string } | { ok: false; error: string };
  /** Base des numéros de sous-agent, tranchée par continuation. */
  seqBase?: number;
  /**
   * Garde-fou de BUDGET du chunk, fourni par l'appelant (il seul connaît le temps
   * mural restant) : renvoie un motif de refus, ou null pour laisser passer. Sans
   * lui, un `spawn_agent` lancé à dix secondes de la soft-deadline serait coupé
   * aussitôt et rendrait un rapport vide — un round payé pour rien.
   */
  budgetGuard?: () => string | null;
}

/**
 * Registre des sous-agents d'UN chunk. Ne lève jamais : tout revient au modèle
 * comme un résultat de tool, réussi ou en erreur.
 */
export class Subagents {
  private readonly jobs = new Map<string, Job>();
  /** Records restaurés d'un checkpoint : lisibles, mais plus rattachés à rien. */
  private readonly history = new Map<string, SubagentRecord>();
  private seq = 0;
  private spawned = 0;

  constructor(
    private readonly runner: SubagentRunner,
    private readonly opts: SubagentsOptions,
  ) {}

  /**
   * Une fille est-elle encore « en cours » au sens du parent ? `running` ET
   * `suspended` comptent : une fille suspendue n'a pas fini, elle attend juste le
   * prochain chunk. Les traiter comme finies rendrait la main au parent (et
   * libérerait le verrou d'écriture) alors que le travail est à moitié fait.
   */
  private isLive(record: SubagentRecord): boolean {
    return record.status === "running" || record.status === "suspended";
  }

  /** Sous-agents encore en vol (repris compris). */
  pending(): number {
    return this.allRecords().filter((r) => this.isLive(r)).length;
  }

  /** Sous-agents dont l'état est SAUVÉ et qui attendent d'être relancés. */
  suspendedCount(): number {
    return this.allRecords().filter((r) => r.status === "suspended").length;
  }

  /**
   * Un `implement` occupe-t-il la sandbox ? Lu par le verrou d'écriture du parent
   * ET par le refus d'un second `implement`.
   *
   * Un `implement` SUSPENDU compte : ses éditions sont à moitié posées sur le
   * disque, et il va reprendre. Le laisser passer pour « fini » entre deux chunks
   * ouvrirait exactement la fenêtre que le verrou existe pour fermer.
   */
  hasRunningImplement(): boolean {
    return this.runningImplementId() !== null;
  }

  /** Id du `implement` en vol, pour NOMMER le sous-agent dans un refus. */
  runningImplementId(): string | null {
    const record = this.allRecords().find(
      (r) => this.isLive(r) && r.mode === "implement",
    );
    return record?.id ?? null;
  }

  /**
   * Le PARENT peut-il appeler ce tool en ce moment ? Renvoie un refus, ou null.
   *
   * C'est le verrou d'écriture de la sandbox partagée, du côté du parent. Il vit ici
   * — dans le module de politique — et pas en `if` au fil de l'exec-tool, parce que
   * c'est exactement le genre de règle dont la régression ne se verrait qu'en
   * production, sur un diff déjà commité de travers.
   */
  writeLock(toolName: string): ToolOutcome | null {
    if (!PARENT_WRITE_TOOLS.has(toolName)) return null;
    const busy = this.runningImplementId();
    if (!busy) return null;
    return fail(
      `Sub-agent ${busy} is editing the repository right now, and this sandbox is SHARED — writing alongside it ` +
        `would corrupt the turn's diff, and committing now would capture its work half-written (a new component ` +
        `without its translations, a rename left in the middle). Wait for its report: it is handed to you on its ` +
        `own, you have nothing to call. Reading, searching and run_command stay available meanwhile.`,
      SUBAGENT_WRITE_LOCKED_REASON,
    );
  }

  /** Tous les records connus du chunk (restaurés compris), du plus ancien au plus récent. */
  private allRecords(): SubagentRecord[] {
    return [...this.history.values(), ...[...this.jobs.values()].map((j) => j.record)];
  }

  /**
   * Exécute `spawn_agent`. Lance SANS attendre : rend `{ id, status: "running" }`
   * aussitôt. Le rapport revient tout seul à une frontière de round suivante — c'est
   * ça, le wakeup, et c'est pour ça qu'aucun `wait_agent` n'est exposé.
   */
  async spawn(
    args: Record<string, unknown>,
    ctx: { parentCallId?: string } = {},
  ): Promise<ToolOutcome> {
    const task = String(args.task ?? "").trim();
    if (!task) return fail("`task` is required: describe the work to delegate.");

    const mode = String(args.mode ?? "").trim();
    if (!MODES.has(mode)) {
      return fail(
        `\`mode\` must be "explore" (read-only investigation) or "implement" (edits the repository) — got ${JSON.stringify(mode)}.`,
      );
    }
    const expectedOutput = String(args.expected_output ?? "").trim();
    if (!expectedOutput) {
      return fail(
        "`expected_output` is required: the report is ALL you get back, so describe precisely what it must contain.",
      );
    }

    let thinkingEffort: SubagentThinkingEffort | null = null;
    if (args.thinking_effort != null && String(args.thinking_effort).trim() !== "") {
      const raw = String(args.thinking_effort).trim();
      if (!EFFORTS.has(raw)) {
        return fail(
          `\`thinking_effort\` must be "low", "medium" or "high" — got ${JSON.stringify(raw)}. Omit it to inherit your own level.`,
        );
      }
      thinkingEffort = raw as SubagentThinkingEffort;
    }

    let model: string | null = null;
    if (args.model != null && String(args.model).trim() !== "") {
      const raw = String(args.model).trim();
      if (!this.opts.resolveModel) {
        return fail(
          "This session cannot run a sub-agent on another model (its provider serves a single model family). Omit `model`: the sub-agent runs on yours.",
        );
      }
      const resolved = this.opts.resolveModel(raw);
      if (!resolved.ok) return fail(resolved.error);
      model = resolved.id;
    }

    // Le prompt de cadrage AVANT toute réservation : un template inconnu ou une
    // variable manquante ne doit pas consommer un slot.
    let prompt: string;
    try {
      prompt = renderSubagentPrompt({
        templateId: args.prompt_template == null ? null : String(args.prompt_template),
        vars: args.template_vars,
        task,
        expectedOutput,
      });
    } catch (err) {
      if (err instanceof SubagentTemplateError) return fail(err.message);
      return fail(
        `prompt_template could not be rendered: ${err instanceof Error ? err.message : String(err)}. Available templates: ${SUBAGENT_TEMPLATE_IDS.join(", ")}.`,
      );
    }

    // Un seul écrivain dans la sandbox partagée.
    if (mode === "implement") {
      const busy = this.runningImplementId();
      if (busy) {
        return fail(
          `Sub-agent ${busy} is already editing the repository, and the sandbox is SHARED — a second writer would corrupt the diff. Wait for its report (it comes back on its own), then delegate again. \`explore\` sub-agents can run in parallel meanwhile.`,
          SUBAGENT_LIMIT_REASON,
        );
      }
    }

    // Plus assez de temps mural dans le chunk pour qu'une fille produise quoi que
    // ce soit d'utile : on refuse MAINTENANT plutôt que de rendre un rapport vide.
    const noBudget = this.opts.budgetGuard?.();
    if (noBudget) return fail(noBudget, SUBAGENT_LIMIT_REASON);

    if (this.spawned >= MAX_SUBAGENTS_PER_CHUNK) {
      return fail(
        `You have already launched ${this.spawned} sub-agents in this turn (the cap is ${MAX_SUBAGENTS_PER_CHUNK}). Do the rest yourself, or finish the turn and delegate again in the next one.`,
        SUBAGENT_LIMIT_REASON,
      );
    }

    const running = this.pending();
    if (running >= this.opts.maxParallel) {
      const busy = [...this.jobs.values()]
        .filter((j) => j.record.status === "running")
        .map((j) => `${j.record.id} (${j.record.mode})`)
        .join(", ");
      return fail(
        `Too many sub-agents running at once (${running}/${this.opts.maxParallel}). Wait for one to report back — they come back on their own. Running: ${busy}.`,
        SUBAGENT_LIMIT_REASON,
      );
    }

    const id = `sub-${(this.opts.seqBase ?? 0) + ++this.seq}`;
    this.spawned++;
    // Réservation AVANT tout await : les tool-calls d'un round peuvent partir en
    // parallèle, et deux `spawn` simultanés passeraient sinon tous les deux sous le
    // plafond (même précaution que `BackgroundJobs.start`).
    const record: SubagentRecord = {
      id,
      task: cap(task, TASK_MAX_CHARS),
      mode: mode as SubagentMode,
      model,
      thinkingEffort,
      status: "running",
      rounds: 0,
      costUsd: 0,
      startedAt: Date.now(),
      delivered: false,
      parentCallId: ctx.parentCallId,
      expectedOutput,
      slot: (this.opts.seqBase ?? 0) + this.seq,
    };
    this.launch(record, { prompt, task });

    return {
      result: {
        id,
        status: "running",
        mode: record.mode,
        ...(model ? { model } : {}),
        ...(thinkingEffort ? { thinking_effort: thinkingEffort } : {}),
        note:
          `Launched in the background. You are NOT waiting for it: keep working, and its report will be handed to you ` +
          `as soon as it is ready — including after you have replied (you will be woken up). There is no tool to wait ` +
          `for it. Check on it any time with agent_status {id:"${id}"}, or list_agents for all of them.` +
          (record.mode === "implement"
            ? ` While ${id} is editing, YOUR OWN editing tools are refused (one writer at a time in this shared sandbox) — reading and run_command stay open.`
            : ""),
      },
      success: true,
    };
  }

  /**
   * Met une fille en vol et l'enregistre. Chemin UNIQUE du premier lancement et de
   * la reprise : c'est ce qui garantit qu'une fille reprise obéit aux mêmes règles
   * (verrou d'écriture, comptage, livraison unique) qu'une fille neuve.
   *
   * Synchrone jusqu'à `jobs.set` — aucun `await` entre le contrôle d'exclusivité de
   * `spawn` et cette inscription, sans quoi deux `implement` pourraient passer.
   */
  private launch(
    record: SubagentRecord,
    opts: {
      prompt?: string;
      task?: string;
      resumeMessages?: AgentChatMessage[];
      resumeUsageSeq?: number;
      roundsSoFar?: number;
      costSoFar?: number;
    },
  ): void {
    const controller = new AbortController();
    const job: Job = { record, controller, settled: Promise.resolve(), suspending: false };
    this.jobs.set(record.id, job);
    job.settled = this.runner
      .run({
        id: record.id,
        parentCallId: record.parentCallId,
        mode: record.mode,
        task: opts.task ?? record.task,
        prompt: opts.prompt ?? "",
        expectedOutput: record.expectedOutput ?? "",
        model: record.model,
        thinkingEffort: record.thinkingEffort,
        slot: record.slot ?? 0,
        signal: controller.signal,
        isSuspending: () => job.suspending,
        onRound: () => {
          record.rounds++;
        },
        resumeMessages: opts.resumeMessages,
        resumeUsageSeq: opts.resumeUsageSeq,
        roundsSoFar: opts.roundsSoFar,
        costSoFar: opts.costSoFar,
      })
      .then((res) => {
        record.status = res.status;
        // `onRound` n'avance qu'un PROXY pendant le vol (le seul signal que l'emit
        // enveloppé voit est un tool-call) ; à l'arrivée, le compte de la boucle
        // fille est autoritaire.
        record.rounds = res.rounds > 0 ? res.rounds : record.rounds;
        record.costUsd = res.costUsd;
        if (res.status === "suspended") {
          // Son état est SAUVÉ : pas de rapport (elle n'a pas fini), mais tout ce
          // qu'il faut pour repartir au chunk suivant.
          record.messages = res.messages;
          record.usageSeq = res.usageSeq;
          return;
        }
        record.report = res.report;
        delete record.messages;
      })
      .catch((err: unknown) => {
        // Un runner qui lève est un BUG côté mains, pas une erreur du modèle : on
        // le rapporte comme rapport d'erreur plutôt que de laisser le sous-agent
        // « running » pour toujours (le parent l'attendrait en fin de tour).
        record.status = "error";
        record.report = `The sub-agent could not run: ${err instanceof Error ? err.message : String(err)}`;
      });
  }

  /** Exécute `agent_status` (lecture seule). */
  status(args: Record<string, unknown>): ToolOutcome {
    const id = String(args.id ?? "").trim();
    if (!id) return fail("`id` is required — the id returned by spawn_agent (e.g. \"sub-1\").");
    const record = this.jobs.get(id)?.record ?? this.history.get(id);
    if (!record) {
      const known = this.allRecords().map((r) => r.id);
      return fail(
        `No sub-agent ${JSON.stringify(id)} in this session. ` +
          (known.length
            ? `Known sub-agents: ${known.join(", ")}.`
            : "You have not launched any yet."),
      );
    }
    return {
      result: {
        ...this.summarize(record),
        // Rapport PARTIEL s'il en existe un : un sous-agent coupé a souvent déjà
        // dit l'essentiel, et le parent doit pouvoir le lire sans attendre.
        ...(record.report
          ? { report: cap(record.report, SUBAGENT_REPORT_MAX_CHARS), report_delivered: record.delivered }
          : {}),
        ...(record.status === "running"
          ? {
              note: "Still working. You do not need to poll: its report is handed to you automatically when it finishes.",
            }
          : {}),
      },
      success: true,
    };
  }

  /** Exécute `list_agents` (lecture seule). */
  list(): ToolOutcome {
    const records = this.allRecords();
    return {
      result: {
        agents: records.map((r) => this.summarize(r)),
        running: this.pending(),
        max_parallel: this.opts.maxParallel,
        ...(records.length === 0
          ? { note: "You have not launched any sub-agent in this session." }
          : {}),
      },
      success: true,
    };
  }

  /** Vue publique d'un record (mêmes champs pour `agent_status` et `list_agents`). */
  private summarize(r: SubagentRecord): Record<string, unknown> {
    return {
      id: r.id,
      status: r.status,
      mode: r.mode,
      task: r.task,
      rounds: r.rounds,
      model: r.model,
      thinking_effort: r.thinkingEffort,
      elapsed_ms: Math.max(0, Date.now() - r.startedAt),
    };
  }

  /**
   * Rapports TERMINÉS pas encore livrés — une seule fois chacun, avec leur coût
   * (que la boucle ajoute à son accumulateur, d'où il rejoint `run.cost_usd`).
   * Drainé au sommet de chaque round, comme le steering : c'est le wakeup.
   *
   * Le coût livré est le DELTA restant à imputer, pas le cumul : une fille reprise a
   * pu voir sa dépense des chunks précédents déjà portée au run par
   * `settleUnbilled()` (MIN-202).
   */
  drainReports(): Array<{ id: string; text: string; costUsd: number }> {
    // `suspended` n'est PAS livrable : la fille n'a pas fini, elle reprend au chunk
    // suivant. La livrer ici donnerait au parent un rapport vide et lui ferait
    // croire le travail terminé.
    const ready = this.allRecords().filter((r) => !this.isLive(r) && !r.delivered);
    if (ready.length === 0) return [];
    // `pending()` ne compte que les `running` : ceux qu'on livre en sont déjà
    // sortis, donc le parent lit bien « combien travaillent ENCORE ».
    const stillRunning = this.pending();
    return ready.map((record) => {
      record.delivered = true;
      const costUsd = Math.max(0, record.costUsd - (record.costBilled ?? 0));
      record.costBilled = record.costUsd;
      return {
        id: record.id,
        text: formatSubagentReport(record, { stillRunning }),
        costUsd,
      };
    });
  }

  /**
   * Impute au run tout ce que les filles ont dépensé et qui n'a encore été porté
   * par personne, et rend ce total (MIN-202).
   *
   * Ce qu'il rattrape : une fille SUSPENDUE. `drainReports()` ne la livre pas — elle
   * n'a pas fini — donc son chunk de dépense n'entrait dans aucun `newCost`, et le
   * plafond du run se rechargeait d'autant à chaque continuation. Une fille dont le
   * record est restauré `cut` et `delivered` (chunk mort brutalement) ne rendait, elle,
   * jamais sa dépense du tout.
   *
   * Idempotent : chaque record ne rend que son delta, et sort marqué facturé. À
   * appeler APRÈS le drain final, en fin de chunk.
   */
  settleUnbilled(): number {
    let total = 0;
    for (const record of this.allRecords()) {
      const delta = record.costUsd - (record.costBilled ?? 0);
      if (delta <= 0) continue;
      total += delta;
      record.costBilled = record.costUsd;
    }
    return total;
  }

  /**
   * Attend qu'AU MOINS un sous-agent rende la main, dans la limite de `budgetMs`,
   * puis draine. Appelé par la boucle quand le modèle a fini d'appeler des tools :
   * tant qu'il revient des rapports, le tour REPART — c'est ce qui fait tenir le
   * contrat « tu n'attends pas, le rapport te revient » à l'intérieur du chunk.
   * Rien en vol et rien à livrer → `[]`, le tour se termine.
   */
  async awaitReports(
    budgetMs: number,
    /**
     * Sonde d'INTERRUPTION de l'attente, polée pendant qu'on attend : l'utilisateur
     * a écrit au parent (« ça prend trop de temps, où en es-tu ? »). Elle rend la
     * main SANS couper les filles — le parent reprend son tour, lit le message et
     * répond, pendant qu'elles continuent. Sans elle, un message envoyé pendant une
     * attente de trois minutes ne serait lu qu'à la fin de celle-ci.
     */
    until?: () => Promise<boolean>,
  ): Promise<{ reports: Array<{ id: string; text: string; costUsd: number }>; interrupted: boolean }> {
    const ready = this.drainReports();
    if (ready.length > 0) return { reports: ready, interrupted: false };
    const inflight = [...this.jobs.values()]
      .filter((j) => j.record.status === "running")
      .map((j) => j.settled);
    if (inflight.length === 0 || budgetMs <= 0) return { reports: [], interrupted: false };

    let interrupted = false;
    const deadline = Date.now() + budgetMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = true;
    // La sonde tourne en parallèle de l'attente et la fait tomber dès qu'elle est
    // vraie. Ce n'est PAS un sleep déguisé : rien n'est consommé côté modèle
    // pendant ce temps, et l'attente s'arrête à la première des trois causes —
    // une fille qui rend son rapport, l'utilisateur qui parle, ou le budget.
    const watch = until
      ? (async () => {
          while (polling && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, STEERING_POLL_MS));
            if (!polling) return;
            if (await until().catch(() => false)) {
              interrupted = true;
              return;
            }
          }
        })()
      : null;

    try {
      await Promise.race(
        [
          Promise.race(inflight),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, budgetMs);
          }),
          ...(watch ? [watch] : []),
        ].filter(Boolean),
      );
    } finally {
      polling = false;
      if (timer) clearTimeout(timer);
    }
    return { reports: this.drainReports(), interrupted };
  }

  /**
   * Coupe tous les sous-agents en vol (fin de chunk, interruption, erreur, budget
   * épuisé). Best-effort, ne lève jamais. Après cet appel, `drainReports()` livre
   * les rapports PARTIELS : c'est ce qui les met dans le checkpoint et donc dans le
   * chunk suivant, plutôt que de les perdre avec la fonction Vercel.
   *
   * « En vol » se lit `isLive()` — `running` ET `suspended` (MIN-207). Une fille
   * AUTO-SUSPENDUE (elle a rendu son historique à la frontière d'un round, de son
   * propre chef) n'est pas finie : ne pas la couper la laisserait `suspended` dans
   * le checkpoint, c'est-à-dire REPRENABLE, sur tous les chemins de sortie où le
   * tour s'arrête pour de bon — `ask_user`, interruption, erreur, budget. Elle
   * ressuscitait alors des heures plus tard sur une tâche périmée, écrivait dans le
   * dépôt, brûlait du quota, et le verrou d'écriture du parent la croyait vivante.
   */
  async cutAll(reason: string): Promise<number> {
    const live = [...this.jobs.values()].filter((j) => this.isLive(j.record));
    if (live.length === 0) return 0;
    for (const job of live) {
      // Rien à annuler sur une suspendue : sa boucle a déjà rendu la main, son
      // `AbortController` n'écoute plus personne.
      if (job.record.status !== "running") continue;
      try {
        job.controller.abort();
      } catch {
        // best-effort
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(live.map((j) => j.settled)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CUT_GRACE_MS);
        }),
      ]);
    } catch {
      // best-effort
    } finally {
      if (timer) clearTimeout(timer);
    }
    // Une fille qui n'a pas rendu la main dans le délai de grâce est déclarée
    // coupée quand même : le chunk ne peut pas l'attendre, et son record doit dire
    // la vérité plutôt que « running » pour l'éternité. Une suspendue passe par ici
    // aussi : c'est ce `cut` qui la rend indélivrable à `resumeSuspended()` et
    // livrable, une bonne fois, à `drainReports()`.
    for (const job of live) {
      if (!this.isLive(job.record)) continue;
      job.record.status = "cut";
      job.record.report = job.record.report ?? `Stopped before producing a report (${reason}).`;
      // L'historique ne sert QU'À reprendre : le garder n'ouvrirait aucune reprise
      // (`restore` ne relance que les `suspended`) et pèserait sur le checkpoint.
      delete job.record.messages;
    }
    return live.length;
  }

  /**
   * Fin de chunk PROPRE : demande à chaque fille en vol de s'arrêter à sa prochaine
   * frontière de round et de rendre son historique. Elles repartiront au chunk
   * suivant (`resumeSuspended`) — c'est ce qui leur permet de dépasser les 300 s de
   * la fonction Vercel.
   *
   * Différent de `cutAll`, qui les tue SANS reprise (erreur, fin de run). Ici on
   * abandonne le chunk, pas le travail.
   */
  async suspendAll(): Promise<number> {
    const live = [...this.jobs.values()].filter((j) => j.record.status === "running");
    if (live.length === 0) return 0;
    for (const job of live) {
      job.suspending = true;
      try {
        job.controller.abort();
      } catch {
        // best-effort
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(live.map((j) => j.settled)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CUT_GRACE_MS);
        }),
      ]);
    } catch {
      // best-effort
    } finally {
      if (timer) clearTimeout(timer);
    }
    // Une fille qui n'a pas rendu son historique à temps ne peut pas être reprise :
    // on la déclare coupée plutôt que de promettre une reprise impossible.
    for (const job of live) {
      if (job.record.status !== "running") continue;
      job.record.status = "cut";
      job.record.report ??= "Stopped when the turn ran out of time, before it could save its state.";
    }
    return live.length;
  }

  /**
   * Relance les filles SUSPENDUES au chunk précédent, avec leur historique. Appelé
   * à l'amorçage, avant que la boucle du parent ne reprenne : leurs rapports
   * arriveront par le même wakeup que d'habitude.
   */
  resumeSuspended(): number {
    const resumable = [...this.history.values()].filter(
      (r) => r.status === "suspended" && (r.messages?.length ?? 0) > 0,
    );
    for (const record of resumable) {
      this.history.delete(record.id);
      record.status = "running";
      record.delivered = false;
      this.launch(record, {
        resumeMessages: record.messages,
        resumeUsageSeq: record.usageSeq,
        roundsSoFar: record.rounds,
        costSoFar: record.costUsd,
      });
      // L'historique ne vit plus que dans la boucle : le garder ici doublerait le
      // checkpoint pour rien tant qu'elle tourne.
      delete record.messages;
    }
    return resumable.length;
  }

  /** Records à persister dans le checkpoint : les plus récents, rapport capé. */
  records(): SubagentRecord[] {
    return this.allRecords()
      .slice(-SUBAGENT_RECORDS_KEPT)
      .map((r) => ({
        ...r,
        ...(r.report ? { report: cap(r.report, SUBAGENT_RECORD_REPORT_MAX_CHARS) } : {}),
      }));
  }

  /**
   * Restaure les records d'un checkpoint. Ils sont LISIBLES (`agent_status` /
   * `list_agents` répondent) mais plus rattachés à rien : une promesse ne survit
   * pas à la fin d'une fonction Vercel. Un record encore « running » à la reprise
   * est donc déclaré coupé — et marqué LIVRÉ, son rapport partiel étant déjà parti
   * dans les messages du chunk précédent.
   */
  restore(records: SubagentRecord[] | null | undefined): void {
    for (const raw of records ?? []) {
      if (!raw?.id || typeof raw.id !== "string") continue;
      // `suspended` est le SEUL état qui traverse un chunk vivant : son historique
      // est là, on le relancera (`resumeSuspended`). Un `running` restauré, lui,
      // vient d'un chunk mort BRUTALEMENT (crash) — aucun historique n'a été
      // sauvé, donc rien à reprendre : coupé, et son rapport partiel est déjà parti
      // dans les messages du chunk précédent, d'où `delivered`.
      const resumable = raw.status === "suspended" && (raw.messages?.length ?? 0) > 0;
      // Un état « en vol » qu'on ne peut PAS reprendre doit devenir `cut`, jamais
      // rester `suspended` : `suspended` compte comme vivant (verrou d'écriture,
      // parking du parent), donc un record irréprenable laissé tel quel garerait le
      // parent pour l'éternité en attendant une fille qui ne repartira jamais.
      const stalled = raw.status === "running" || raw.status === "suspended";
      const record: SubagentRecord = {
        ...raw,
        status: resumable ? "suspended" : stalled ? "cut" : raw.status,
        delivered: !resumable,
      };
      this.history.set(record.id, record);
      // Les ids restent uniques après reprise : le compteur repart au-dessus du
      // plus grand numéro restauré (les records du chunk précédent portent la
      // tranche de leur continuation, mais un checkpoint bricolé pourrait mentir).
      const n = Number.parseInt(record.id.replace(/^sub-/, ""), 10);
      if (Number.isInteger(n)) {
        this.seq = Math.max(this.seq, n - (this.opts.seqBase ?? 0));
      }
    }
  }
}
