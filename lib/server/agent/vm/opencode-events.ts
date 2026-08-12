import { cap, toolArgSummary } from "../tool-summary";
import { parseAskUserQuestions, type AskUserQuestion } from "@/lib/ask-user";
import type { PermissionAsk } from "./opencode-permissions";
import type { AgentEventType } from "@/lib/agent-api";

/**
 * LE FLUX D'OPENCODE, TRADUIT EN NOTRE FIL (MIN-286, lot 1).
 *
 * Un module PUR : il prend un événement du `/event` d'opencode et rend ce que le
 * superviseur doit émettre. Aucune IO, aucun état de réseau — donc testable sur
 * des **fixtures réellement capturées** ([fixtures/opencode-turn.ndjson](fixtures/opencode-turn.ndjson),
 * un tour complet avec appel de tool), ce que la traduction faite au fil de l'eau
 * dans un client HTTP n'aurait jamais permis.
 *
 * CE QUE LA TRADUCTION DOIT TENIR, et c'est le critère de bascule du lot 3 : **le
 * fil raconte la même chose**. Mêmes types d'events, mêmes payloads, même ordre.
 * Un `tool_call` dont le payload change de forme casse l'affichage du fil ET la
 * relecture d'un run passé, puisque `agent_run_events` ne garde rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ (serveur réel, tour complet capturé le 2026-08-12)
 *
 * - un appel de tool passe par **trois** `message.part.updated` : `pending`
 *   (l'input est encore vide), `running` (input complet, `time.start`), puis
 *   `completed` (output, `time.end`) ou `error`. C'est `running` qui vaut notre
 *   `tool_call` — sur `pending`, on ne saurait pas dire QUOI est appelé ;
 * - le texte de la réponse arrive en `message.part.delta` (`field: "text"`,
 *   `delta`), puis le part complet en `message.part.updated` ;
 * - le coût du round arrive sur `message.updated` du message assistant, deux fois
 *   (le même nombre) : d'où la déduplication par `messageID` + `finish` ;
 * - `session.status` alterne `busy`/`idle`, et `session.idle` clôt le tour.
 *
 * LES NOMS SONT TRADUITS DANS LES DEUX SENS. Opencode appelle `read` ce que nous
 * appelons `read_file`, et lui passe `filePath` là où nous passons `path`. Le fil,
 * lui, sait afficher `read_file`/`path` — et la relecture d'un run d'il y a trois
 * mois aussi. Traduire ici est donc le seul endroit où ça ne coûte rien ; le faire
 * dans l'UI aurait obligé à y garder les deux vocabulaires pour toujours.
 */

/** Un événement du flux `/event`, tel qu'opencode le publie. */
export interface OpencodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

/** Ce que le superviseur doit émettre — un event de NOTRE fil. */
export interface TranslatedEvent {
  type: AgentEventType;
  payload: Record<string, unknown>;
}

/** Le coût et les tokens d'un round, relevés sur le message assistant. */
export interface RoundUsage {
  messageId: string;
  /** La session qui a payé ce round — la mère, ou une fille (cf. `sessionId`). */
  sessionId: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `stop`, `tool_calls`, `length`… — tel qu'opencode le rend. */
  finish: string | null;
}

/** Ce qu'un événement traduit produit : des events, du direct, du compte. */
export interface Translation {
  /**
   * LA SESSION D'OÙ VIENT L'ÉVÉNEMENT, et c'est ce qui tient le lot 2.
   *
   * Le flux `/event` est celui du SERVEUR, pas d'une session : quand le modèle
   * délègue (`task`), la fille ouvre sa propre session et ses événements
   * arrivent ici, mêlés à ceux de la mère. Trois choses en dépendent, et chacune
   * casse en silence sans ce champ : un `session.idle` de FILLE terminerait le
   * tour de la mère, le texte de la fille entrerait dans la réponse (donc dans
   * le message de commit), et sa dépense se rangerait dans la bande de seq du
   * parent au lieu de la sienne.
   */
  sessionId?: string;
  events: TranslatedEvent[];
  /** Le texte du round tel qu'écrit jusqu'ici (COMPLET, pas un delta). */
  liveText?: string;
  /** Un round assistant s'est terminé : sa ligne de ledger est prête. */
  usage?: RoundUsage;
  /** Le tour est fini (`session.idle`). */
  idle?: boolean;
  /** Le tour est mort (`session.error`) — le message est celui d'opencode. */
  error?: string;
  /**
   * Un tool attend le verdict du harness (`permission.asked`). C'est là que
   * `command-guard` et `repo-path` s'exécutent — cf.
   * [opencode-permissions.ts](opencode-permissions.ts).
   */
  permission?: PermissionAsk;
  /** Le modèle pose ses questions (`question.asked`) : c'est notre `ask_user`. */
  question?: { id: string; callId: string; questions: AskUserQuestion[] };
  /**
   * UNE FILLE VIENT DE NAÎTRE, et voici à quel appel de `task` elle se rattache.
   *
   * C'est la seule frame qui le dise : le tool `task` pose sur son part une
   * `state.metadata = {parentSessionId, sessionId, model}` (mesuré le
   * 2026-08-12, sonde de délégation), et elle arrive AVANT le premier message de
   * la fille. Sans ce rattachement, les events de la fille ne peuvent pas porter
   * le `parent_call_id` sous lequel le fil les replie, et sa dépense ne sait pas
   * dans quelle bande de `seq` s'écrire.
   */
  child?: { sessionId: string; callId: string; agent: string; model?: string };
}

/**
 * LES NOMS DE TOOLS, D'OPENCODE VERS LES NÔTRES.
 *
 * `webfetch` n'y est pas : nous n'avons jamais eu ce tool, donc le fil n'a pas de
 * nom à lui opposer — il passe tel quel, et c'est un nom de plus au vocabulaire
 * plutôt qu'un nom traduit de travers. `question` non plus : il ne devient pas un
 * `tool_call` mais un event `question`, qui a sa propre forme.
 */
const TOOL_NAMES: Record<string, string> = {
  read: "read_file",
  write: "write_file",
  edit: "edit_file",
  bash: "run_command",
  task: "spawn_agent",
  // Ceux-là portent déjà notre nom : les écrire rend la table lisible d'un coup
  // d'œil, et surtout vérifiable — « les 14 intégrés sont-ils tous traités ? ».
  glob: "glob",
  grep: "grep",
  apply_patch: "apply_patch",
};

/**
 * LES ARGUMENTS, de même. La table est par tool et par champ, parce que c'est la
 * seule forme qui se relise : `filePath → path` sur `read`, `include → glob` sur
 * `grep`. Un champ absent de la table passe tel quel — nos tools de domaine, eux,
 * ont exactement nos noms, puisque c'est nous qui les avons générés.
 */
const TOOL_ARGS: Record<string, Record<string, string>> = {
  read: { filePath: "path" },
  write: { filePath: "path" },
  edit: { filePath: "path", oldString: "old_string", newString: "new_string", replaceAll: "replace_all" },
  bash: { command: "command", workdir: "workdir" },
  grep: { include: "glob" },
  task: { subagent_type: "mode", description: "task" },
};

/** Le nom de tool que le fil connaît. */
export function ourToolName(opencodeName: string): string {
  return TOOL_NAMES[opencodeName] ?? opencodeName;
}

/** Les arguments d'un tool, renommés pour que `toolArgSummary` les reconnaisse. */
export function ourToolArgs(
  opencodeName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const table = TOOL_ARGS[opencodeName];
  if (!table) return input;
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [table[k] ?? k, v]));
}

/** Longueur de l'aperçu persisté dans `tool_result` — la même que la boucle. */
const PREVIEW_MAX = 400;

function numberAt(source: unknown, ...path: string[]): number {
  let node: unknown = source;
  for (const key of path) {
    if (!node || typeof node !== "object") return 0;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "number" && Number.isFinite(node) ? node : 0;
}

/**
 * L'état d'un tour, entre deux événements. Le traducteur est pur, mais le flux ne
 * l'est pas : un `delta` ne porte que son fragment, et un `message.updated` répété
 * porte deux fois le même coût.
 */
export interface TurnStreamState {
  /**
   * Texte accumulé du round en cours, PAR SESSION puis par part.
   *
   * La double clé n'est pas de la prudence : une fille écrit son rapport
   * pendant que la mère attend, et un seul sac ferait entrer ce rapport dans la
   * réponse du tour — donc dans le message de commit, et dans ce que le fil
   * affiche comme la parole de l'agent.
   */
  textByPart: Map<string, Map<string, string>>;
  /**
   * Le texte du DERNIER round terminé, par session — la réponse du tour.
   *
   * Il existe parce que `textByPart` est vidé à la fin de chaque round (le direct
   * doit repartir de zéro, sinon deux rounds s'empilent à l'écran) et que la fin
   * de round arrive AVANT `session.idle`. Sans cette copie, ce que le tour rend
   * comme réponse est systématiquement vide : le fil n'affiche rien, et le
   * message de commit se rabat sur sa forme générique.
   */
  lastRoundText: Map<string, string>;
  /** Rounds dont le coût a déjà été compté (`messageID`). */
  billed: Set<string>;
  /** `callID` déjà annoncés : `running` peut se répéter. */
  announced: Set<string>;
}

export function newTurnStreamState(): TurnStreamState {
  return {
    textByPart: new Map(),
    lastRoundText: new Map(),
    billed: new Set(),
    announced: new Set(),
  };
}

/** Le sac de texte d'une session, créé à la demande. */
function partsOf(state: TurnStreamState, sessionId: string): Map<string, string> {
  let parts = state.textByPart.get(sessionId);
  if (!parts) {
    parts = new Map();
    state.textByPart.set(sessionId, parts);
  }
  return parts;
}

/**
 * D'où vient l'événement. `properties.sessionID` est posé sur TOUTES les frames
 * mesurées (fixture capturée) ; les deux replis lisent la même chose une couche
 * plus bas, pour qu'une frame d'une version future qui l'oublierait ne se range
 * pas silencieusement dans la session vide — c'est-à-dire dans celle de la mère.
 */
function sessionOf(props: Record<string, unknown>): string {
  const direct = props.sessionID;
  if (typeof direct === "string" && direct) return direct;
  for (const key of ["part", "info"]) {
    const node = props[key];
    if (node && typeof node === "object") {
      const nested = (node as Record<string, unknown>).sessionID;
      if (typeof nested === "string" && nested) return nested;
    }
  }
  return "";
}

/**
 * Traduit UN événement. Rend ce qu'il faut émettre, et mute l'état de flux.
 *
 * Ne lève jamais : le flux vient d'un tiers, et une forme inattendue doit être
 * ignorée, pas tuer un tour de deux heures. Ce qui n'est pas reconnu ne produit
 * rien — c'est ce que `events: []` veut dire.
 */
export function translateEvent(event: OpencodeEvent, state: TurnStreamState): Translation {
  const props = event.properties ?? {};
  const sessionId = sessionOf(props);

  switch (event.type) {
    case "message.part.delta": {
      if (props.field !== "text") return { sessionId, events: [] };
      const partId = String(props.partID ?? "");
      const delta = typeof props.delta === "string" ? props.delta : "";
      if (!partId || !delta) return { sessionId, events: [] };
      const parts = partsOf(state, sessionId);
      const text = (parts.get(partId) ?? "") + delta;
      parts.set(partId, text);
      return { sessionId, events: [], liveText: text };
    }

    case "message.part.updated": {
      const part = (props.part ?? {}) as Record<string, unknown>;
      if (part.type === "text") {
        const partId = String(part.id ?? "");
        const text = typeof part.text === "string" ? part.text : "";
        if (partId && text) partsOf(state, sessionId).set(partId, text);
        return { sessionId, events: [], ...(text ? { liveText: text } : {}) };
      }
      if (part.type !== "tool") return { sessionId, events: [] };

      const stateNode = (part.state ?? {}) as Record<string, unknown>;
      const status = String(stateNode.status ?? "");
      const callId = String(part.callID ?? part.id ?? "");
      const opencodeName = String(part.tool ?? "");
      const name = ourToolName(opencodeName);
      const input = ourToolArgs(
        opencodeName,
        (stateNode.input ?? {}) as Record<string, unknown>,
      );

      /**
       * LE RATTACHEMENT D'UNE FILLE, à lire sur TOUS les statuts du part `task`.
       *
       * Mesuré : le premier `running` arrive sans `metadata` (la fille n'existe
       * pas encore), le second la porte. Le lire hors du bloc `running` ci-dessous
       * n'est donc pas de la prudence : c'est la seule frame utile, et elle est
       * une répétition de celle qui a déjà été annoncée.
       */
      const child =
        opencodeName === "task" ? childOf(stateNode, callId, input) : undefined;

      if (status === "running") {
        // `pending` ne dit pas encore QUOI est appelé (`input: {}` mesuré) : un
        // event émis là afficherait un appel sans argument, puis rien.
        if (!callId || state.announced.has(callId)) {
          return { sessionId, events: [], ...(child ? { child } : {}) };
        }
        state.announced.add(callId);
        return {
          sessionId,
          ...(child ? { child } : {}),
          events: [
            { type: "tool_call", payload: { id: callId, name, ...toolArgSummary(name, input) } },
          ],
        };
      }

      if (status === "completed" || status === "error") {
        const success = status === "completed";
        const raw = success ? stateNode.output : (stateNode.error ?? stateNode.output);
        const preview = cap(typeof raw === "string" ? raw : JSON.stringify(raw ?? ""), PREVIEW_MAX);
        return {
          sessionId,
          events: [{ type: "tool_result", payload: { id: callId, name, success, preview } }],
        };
      }
      return { sessionId, events: [] };
    }

    case "message.updated": {
      const info = (props.info ?? {}) as Record<string, unknown>;
      if (info.role !== "assistant") return { sessionId, events: [] };
      const finish = typeof info.finish === "string" ? info.finish : null;
      // Un round non terminé arrive avec `cost: 0` et pas de `finish` : le
      // compter écrirait une ligne de ledger vide, puis une deuxième au vrai
      // coût. Et `message.updated` se répète à l'identique une fois terminé —
      // d'où les deux gardes, qui ne font pas le même travail.
      if (!finish) return { sessionId, events: [] };
      const messageId = String(info.id ?? "");
      if (!messageId || state.billed.has(messageId)) return { sessionId, events: [] };
      state.billed.add(messageId);

      // Un round fini : on GARDE son texte (c'est la réponse du tour) avant de
      // vider le sac, pour que le suivant reparte à zéro. Et on ne vide que
      // CETTE session : effacer celui des autres emporterait, en plein vol, le
      // rapport qu'une fille est en train d'écrire.
      const written = liveTextOf(state, sessionId);
      if (written.trim()) state.lastRoundText.set(sessionId, written);
      partsOf(state, sessionId).clear();

      return {
        sessionId,
        events: [],
        usage: {
          messageId,
          sessionId,
          model: String(info.modelID ?? ""),
          costUsd: numberAt(info, "cost"),
          inputTokens: numberAt(info, "tokens", "input"),
          outputTokens: numberAt(info, "tokens", "output"),
          reasoningTokens: numberAt(info, "tokens", "reasoning"),
          cacheReadTokens: numberAt(info, "tokens", "cache", "read"),
          cacheWriteTokens: numberAt(info, "tokens", "cache", "write"),
          finish,
        },
      };
    }

    case "session.idle":
      // `idle` vaut pour SA session : c'est l'appelant qui sait laquelle est la
      // mère. Une fille au repos ne termine pas le tour.
      return { sessionId, events: [], idle: true };

    case "session.error": {
      const error = (props.error ?? {}) as Record<string, unknown>;
      /**
       * UNE COUPURE N'EST PAS UNE PANNE, et opencode ne fait pas la différence :
       * tout `abort` publie `session.error` avec `name: "MessageAbortedError"`
       * (mesuré). Or nous coupons NOUS-MÊMES le tour dans trois cas voulus — le
       * plafond de dépense, la question posée à l'utilisateur, la deadline. Sans
       * ce filtre, chacun des trois écrivait un event `error` au fil et un
       * `errorMessage: "Aborted"` au rapport, par-dessus le vrai motif.
       */
      if (error.name === "MessageAbortedError") return { sessionId, events: [] };
      const data = (error.data ?? {}) as Record<string, unknown>;
      const message =
        typeof error.message === "string"
          ? error.message
          : typeof data.message === "string"
            ? data.message
            : typeof props.message === "string"
              ? props.message
              : JSON.stringify(error).slice(0, 1000);
      return { sessionId, events: [{ type: "error", payload: { message } }], error: message };
    }

    /**
     * UN TOOL SUSPENDU QUI ATTEND NOTRE VERDICT. Le payload mesuré :
     * `{id, sessionID, permission, patterns, metadata, always, tool:{messageID, callID}}`.
     * Rien n'est émis au fil ici — un refus se raconte dans le `tool_result` du
     * tool refusé, exactement comme la boucle maison le racontait.
     */
    case "permission.asked": {
      const id = String(props.id ?? "");
      if (!id) return { sessionId, events: [] };
      const metadata = (props.metadata ?? {}) as Record<string, unknown>;
      const tool = (props.tool ?? {}) as Record<string, unknown>;
      return {
        sessionId,
        events: [],
        permission: {
          id,
          sessionId,
          permission: String(props.permission ?? ""),
          callId: String(tool.callID ?? ""),
          ...(typeof metadata.command === "string" ? { command: metadata.command } : {}),
          ...(typeof metadata.filepath === "string" ? { filepath: metadata.filepath } : {}),
          // La délégation demande AVANT de résoudre l'agent : c'est ce qui permet
          // de répondre autre chose qu'« Unknown agent type » (cf. `decideTask`).
          ...(typeof metadata.subagent_type === "string"
            ? { subagentType: metadata.subagent_type }
            : {}),
        },
      };
    }

    /**
     * NOTRE `ask_user`, RENDU PAR LE TOOL NATIF. L'event du fil est le MÊME que
     * celui de la boucle maison (`{id, questions}`, `id` = l'appel de tool) : le
     * feed rend une carte de questions, et un run d'il y a trois mois se relit
     * pareil. Seule la graphie du multi-choix change (`multiple` chez opencode,
     * `multi_select` chez nous), et c'est ici qu'on la traduit.
     */
    case "question.asked": {
      const id = String(props.id ?? "");
      const tool = (props.tool ?? {}) as Record<string, unknown>;
      const callId = String(tool.callID ?? id);
      const raw = Array.isArray(props.questions) ? props.questions : [];
      const questions = parseAskUserQuestions({
        questions: raw.map((q) => {
          const rec = (q ?? {}) as Record<string, unknown>;
          return { ...rec, multi_select: rec.multiple === true };
        }),
      });
      if (!id || questions.length === 0) return { sessionId, events: [] };
      return {
        sessionId,
        events: [{ type: "question", payload: { id: callId, questions } }],
        question: { id, callId, questions },
      };
    }

    default:
      // `session.status`, `session.updated`, `session.diff`, `server.connected` :
      // du bruit pour nous. Le fil n'a pas d'équivalent, et en inventer un
      // remplirait `agent_run_events` de lignes que personne ne lit.
      return { sessionId, events: [] };
  }
}

/**
 * Le rattachement d'une fille, lu sur le part du `task` qui l'a lancée.
 * `undefined` tant qu'elle n'a pas de session — c'est-à-dire sur `pending` et sur
 * le premier `running` (mesuré : `metadata: null`).
 *
 * `input` est DÉJÀ traduit (`subagent_type` → `mode`), d'où la lecture par `mode`.
 */
function childOf(
  stateNode: Record<string, unknown>,
  callId: string,
  input: Record<string, unknown>,
): { sessionId: string; callId: string; agent: string; model?: string } | undefined {
  const metadata = (stateNode.metadata ?? {}) as Record<string, unknown>;
  const sessionId = typeof metadata.sessionId === "string" ? metadata.sessionId : "";
  if (!sessionId || !callId) return undefined;
  const model = (metadata.model ?? {}) as Record<string, unknown>;
  const modelId = typeof model.modelID === "string" ? model.modelID : "";
  return {
    sessionId,
    callId,
    agent: String(input.mode ?? ""),
    ...(modelId ? { model: modelId } : {}),
  };
}

/** Le texte du round EN COURS d'une session — la charge du direct. */
export function liveTextOf(state: TurnStreamState, sessionId: string): string {
  return [...(state.textByPart.get(sessionId)?.values() ?? [])].join("");
}

/**
 * CE QUE LA SESSION A RÉPONDU — le round en cours s'il a écrit, le dernier round
 * terminé sinon.
 *
 * Les deux cas arrivent vraiment : un tour qui finit sur du texte a déjà vu son
 * `message.updated` (donc le sac courant est vide, et c'est la copie qui parle),
 * un tour coupé en plein vol n'a que son sac courant.
 */
export function replyOf(state: TurnStreamState, sessionId: string): string {
  const current = liveTextOf(state, sessionId);
  return (current.trim() ? current : (state.lastRoundText.get(sessionId) ?? "")).trim();
}
