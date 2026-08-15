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
  /**
   * LE MODÈLE RÉFLÉCHIT EN CE MOMENT, et depuis combien de temps.
   *
   * Ce que le fil en fait est ce qu'il faisait de la boucle maison (MIN-122) : une
   * ligne compacte avec un compteur, JAMAIS le texte — il arrive replié avec
   * l'event `thinking` de fin de part. C'est le seul signe de vie d'un modèle à
   * `reasoning_level: high`, qui peut penser plusieurs minutes avant d'écrire son
   * premier mot ; sans lui, le fil reste muet et le tour a l'air mort.
   */
  reasoning?: { active: boolean; startedAt: number };
  /** Un round assistant s'est terminé : sa ligne de ledger est prête. */
  usage?: RoundUsage;
  /** Le tour est fini (`session.idle`). */
  idle?: boolean;
  /** Le tour est mort (`session.error`) — le message est celui d'opencode. */
  error?: string;
  /**
   * LE ROUND A ÉTÉ COUPÉ (`MessageAbortedError`) — sans dire par qui.
   *
   * Opencode publie la même chose pour une coupure VOULUE (notre `abort`) et pour
   * une coupure SUBIE (flux du fournisseur tranché en vol). Le traducteur ne peut
   * pas trancher : lui seul sait que c'est une coupure, l'appelant seul sait s'il
   * l'a demandée. D'où ce drapeau plutôt qu'un `error` — cf. la garde du
   * superviseur, qui n'en fait une panne que s'il n'a rien demandé.
   */
  aborted?: true;
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
  /**
   * UNE COMMANDE DU MODÈLE VIENT DE SE TERMINER, avec son code de sortie.
   *
   * C'est ce que lisait `run_command` chez nous, et ce dont la porte de
   * livraison a besoin pour se taire quand le modèle a lancé les tests lui-même
   * (MIN-262, `VerificationSink`). Le tool `bash` d'opencode le pose sur
   * `state.metadata.exit` — un nombre, `null` quand la commande a été abandonnée
   * ou tuée par le timeout. Absent = on ne conclut rien, ce qui est le sens
   * prudent : la porte relance alors la suite entière.
   */
  shell?: { command: string; exit: number };
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
  /**
   * `patchText`, et c'est tout ce que ce tool prend (mesuré sur le binaire :
   * `patchText: p.String.annotate({description: "The full patch text…"})`). Notre
   * résumé, lui, lit `patch` pour compter les en-têtes `*** Update File:` du
   * dialecte Codex — c'est de là que sortent le décompte et les chemins de la vue
   * « fichiers changés ».
   *
   * Sans cette ligne, `toolArgSummary` ne trouvait rien et le fil annonçait
   * **« Patch de 0 fichier »** à chaque édition d'un run `gpt-*` — c'est-à-dire
   * sur le seul chemin d'édition que ces modèles ont.
   */
  apply_patch: { patchText: "patch" },
};

/**
 * `metadata.files` d'une demande de permission → nos chemins, un par fichier.
 *
 * C'est `apply_patch` qui en pose, et lui seul : sa demande est UNIQUE pour un
 * patch qui touche N fichiers, et son `metadata.filepath` n'est que
 * `chemins.join(", ")`. Mesuré sur le binaire (1.18.16) : chaque entrée est
 * `{type: "add"|"update"|"delete", filePath, relativePath, patch, additions,
 * deletions, movePath?}`.
 *
 * On garde `filePath` (absolu) : c'est ce que le garde-fou compare au dépôt, et
 * ce que `repoRelative` sait ramener pour l'affichage — exactement comme le
 * `filepath` d'un `edit`. Une entrée illisible est ignorée plutôt que devinée :
 * la liste sert un garde-fou, une forme inattendue n'a pas à y entrer en
 * silence.
 */
/**
 * L'URL d'une demande de `webfetch` (MIN-360), et de celle-là seulement.
 *
 * `metadata.url` d'abord ; à défaut le premier `patterns`, qui est la chaîne sur
 * laquelle opencode ferait matcher un « toujours » — donc la meilleure
 * approximation de la cible le jour où la métadonnée change de forme. Ce repli est
 * la raison pour laquelle le champ est réservé à `webfetch` : sur un `bash`,
 * `patterns` porte la COMMANDE, et la recopier en « url » serait un champ qui ment.
 *
 * Vide plutôt que deviné : une URL qu'on ne sait pas lire fait REFUSER le fetch
 * ([opencode-permissions.ts](opencode-permissions.ts)), et c'est la bonne issue.
 */
/**
 * LE CHEMIN D'UNE DEMANDE, ET IL N'EST PAS AU MÊME ENDROIT SELON LE TOOL (MIN-360).
 *
 * Une écriture publie `metadata.filepath`, ABSOLU (mesure n°2 de
 * [opencode-permissions.ts](opencode-permissions.ts)). **Une LECTURE publie un
 * `metadata` VIDE** : `ReadTool` appelle
 * `ask({permission: "read", patterns: [<chemin relatif au worktree>], always: ["*"],
 * metadata: {}})` — relevé dans le binaire 1.18.16.
 *
 * Sans ce repli, le verdict de lecture du chemin local ne verrait jamais un
 * chemin, et refuserait **100 % des lectures** en croyant garder les `.env`. Le
 * champ garde donc un seul sens — « le chemin dont cette demande parle » — et
 * c'est ici qu'on va le chercher là où il est.
 */
function permissionPath(
  props: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string {
  if (typeof metadata.filepath === "string" && metadata.filepath.trim()) return metadata.filepath;
  if (String(props.permission ?? "") !== "read") return "";
  const patterns = Array.isArray(props.patterns) ? props.patterns : [];
  const first = patterns.find((p) => typeof p === "string" && p.trim() && p !== "*");
  return typeof first === "string" ? first.trim() : "";
}

function permissionUrl(
  props: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string {
  if (String(props.permission ?? "") !== "webfetch") return "";
  if (typeof metadata.url === "string" && metadata.url.trim()) return metadata.url.trim();
  const patterns = Array.isArray(props.patterns) ? props.patterns : [];
  const first = patterns.find((p) => typeof p === "string" && p.trim());
  return typeof first === "string" ? first.trim() : "";
}

function permissionFiles(
  metadata: Record<string, unknown>,
): { path: string; status: "added" | "modified" | "deleted" }[] {
  if (!Array.isArray(metadata.files)) return [];
  const out: { path: string; status: "added" | "modified" | "deleted" }[] = [];
  for (const raw of metadata.files) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const path =
      typeof entry.filePath === "string" && entry.filePath.trim()
        ? entry.filePath
        : typeof entry.relativePath === "string"
          ? entry.relativePath
          : "";
    if (!path.trim()) continue;
    const type = String(entry.type ?? "");
    out.push({
      path,
      status: type === "add" ? "added" : type === "delete" ? "deleted" : "modified",
    });
  }
  return out;
}

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
  /**
   * DE QUELLE NATURE EST CHAQUE PART, et c'est ce qui sépare la réflexion de la
   * réponse.
   *
   * Opencode publie les deltas d'un part `reasoning` avec **le même
   * `field: "text"`** que ceux d'un part `text` (lu dans le binaire 1.18.16 :
   * `case "reasoning-delta"` appelle `updatePartDelta({… field:"text"})`). Une
   * frame de delta ne dit donc RIEN de ce qu'elle transporte — seul le
   * `message.part.updated` d'ouverture le dit, et il arrive avant.
   *
   * Sans cette table, la chaîne de pensée entrait dans le texte du round : elle
   * s'affichait comme la parole de l'agent, elle repartait dans le message de
   * commit, et le compteur de réflexion du fil restait éteint.
   */
  partKind: Map<string, "text" | "reasoning">;
  /**
   * LES MESSAGES QUI VIENNENT DE NOUS, pas du modèle.
   *
   * Un prompt posté sur la session est republié en `message.part.updated` de type
   * `text`, dans le même flux et sous la même forme que la réponse. Sans ce
   * filtre, la demande de l'utilisateur entrait dans le sac du round : elle
   * ressortait en tête de « ce que le tour a répondu », donc dans le fil et dans
   * le message de commit (mesuré sur la fixture de réflexion, où la réponse du
   * tour commençait par « dis bonjour »).
   */
  userMessages: Set<string>;
  /** Début (ms) de chaque part de réflexion — la durée que le fil affiche. */
  reasoningStart: Map<string, number>;
  /** Rounds dont le coût a déjà été compté (`messageID`). */
  billed: Set<string>;
  /** `callID` déjà annoncés : `running` peut se répéter. */
  announced: Set<string>;
}

export function newTurnStreamState(): TurnStreamState {
  return {
    textByPart: new Map(),
    lastRoundText: new Map(),
    partKind: new Map(),
    userMessages: new Set(),
    reasoningStart: new Map(),
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
      if (state.userMessages.has(String(props.messageID ?? ""))) {
        return { sessionId, events: [] };
      }
      /**
       * UN DELTA DE RÉFLEXION PORTE `field: "text"` LUI AUSSI (cf. `partKind`) :
       * ce qui les sépare est le part, annoncé plus tôt. Il ne rejoint donc pas le
       * sac du round — il fait battre le compteur de réflexion, et c'est tout.
       */
      if (state.partKind.get(partId) === "reasoning") {
        return { sessionId, events: [], reasoning: reasoningTick(state, partId) };
      }
      const parts = partsOf(state, sessionId);
      const text = (parts.get(partId) ?? "") + delta;
      parts.set(partId, text);
      return { sessionId, events: [], liveText: text };
    }

    case "message.part.updated": {
      const part = (props.part ?? {}) as Record<string, unknown>;
      const partId = String(part.id ?? "");
      // Notre propre prompt, republié par la session : il n'a rien à faire dans
      // ce que le tour a répondu (cf. `userMessages`).
      if (state.userMessages.has(String(part.messageID ?? ""))) {
        return { sessionId, events: [] };
      }
      if (part.type === "text") {
        // Marqué même quand le texte est vide : c'est la frame d'OUVERTURE, celle
        // qui arrive avant les deltas, et la seule qui dise de quoi ils sont faits.
        if (partId) state.partKind.set(partId, "text");
        const text = typeof part.text === "string" ? part.text : "";
        if (partId && text) partsOf(state, sessionId).set(partId, text);
        return { sessionId, events: [], ...(text ? { liveText: text } : {}) };
      }
      if (part.type === "reasoning") return reasoningPart(state, sessionId, part, partId);
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
        const shell = opencodeName === "bash" ? shellOf(stateNode, input) : undefined;
        return {
          sessionId,
          events: [{ type: "tool_result", payload: { id: callId, name, success, preview } }],
          ...(shell ? { shell } : {}),
        };
      }
      return { sessionId, events: [] };
    }

    case "message.updated": {
      const info = (props.info ?? {}) as Record<string, unknown>;
      if (info.role !== "assistant") {
        // Le seul endroit du flux qui dise le RÔLE d'un message : les frames de
        // part, elles, n'en portent pas. On le retient donc au passage — c'est ce
        // qui permettra d'écarter les parts de notre propre prompt.
        if (info.role === "user" && typeof info.id === "string" && info.id) {
          state.userMessages.add(info.id);
        }
        return { sessionId, events: [] };
      }
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

      /**
       * LA NARRATION D'UN ROUND INTERMÉDIAIRE — ce que le modèle écrit ENTRE deux
       * séries d'appels de tools, et qui n'existait nulle part sous opencode.
       *
       * Le direct la montrait puis l'effaçait (le sac du round est vidé juste
       * au-dessus, et rien ne prenait le relais) : à l'écran, le texte de l'agent
       * apparaissait pendant quelques secondes puis disparaissait pour toujours.
       * C'est le `thinking` sans `kind` de la boucle maison, au mot près — même
       * type, même plafond de 2 000 caractères, même rendu en bulle.
       *
       * Seuls les rounds qui CONTINUENT (`finish: "tool-calls"`) l'émettent : le
       * texte du dernier round est la réponse du tour, et elle part en `summary`
       * (plafonné à 8 000). Émettre les deux ferait deux bulles dès que la réponse
       * dépasse 2 000 caractères — le dédoublonnage du fil se fait par égalité de
       * texte, et deux plafonds différents ne s'égalent plus.
       *
       * Le test porte donc sur `tool-calls` et PAS sur « différent de `stop` » :
       * `tool-calls` est la seule fin qui laisse la session travailler. Toutes les
       * autres (`length`, `content-filter`, `error`, `other`…) mettent la session
       * au repos, donc terminent le tour — leur texte est la réponse, et la
       * négation les faisait partir DEUX fois, en `thinking` puis en `summary`.
       */
      const narration = finish === "tool-calls" ? written.trim() : "";

      return {
        sessionId,
        events: narration ? [{ type: "thinking", payload: { text: cap(narration, 2000) } }] : [],
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
       * UNE COUPURE N'EST PAS UNE PANNE **QUAND ON L'A DEMANDÉE**, et opencode ne
       * fait pas la différence : tout `abort` publie `session.error` avec
       * `name: "MessageAbortedError"` (mesuré). Or nous coupons NOUS-MÊMES le tour
       * dans trois cas voulus — le plafond de dépense, la question posée à
       * l'utilisateur, la deadline. Sans filtre, chacun des trois écrivait un event
       * `error` au fil et un `errorMessage: "Aborted"` au rapport, par-dessus le
       * vrai motif.
       *
       * Mais le filtre ne peut pas être INCONDITIONNEL, et c'est ce qu'il était :
       * une coupure que personne n'a demandée (flux du fournisseur tranché en vol)
       * disparaissait avec lui, et le tour se rangeait en « terminé » sans une
       * ligne — fil figé sur « Ouverture de la sandbox », run sans résumé ni
       * erreur, dépense au ledger. Observé sur le run `ec9b2ed5` (2026-08-12,
       * `openai/gpt-5.6-luna`) : 219 tokens facturés, message assistant SANS aucune
       * part, `MessageAbortedError`, et rien nulle part.
       *
       * On rend donc la coupure au superviseur, qui est le seul à savoir s'il l'a
       * demandée.
       */
      if (error.name === "MessageAbortedError") {
        /**
         * UN ROUND COUPÉ FERME SON SAC, comme un round terminé (MIN-286).
         *
         * Le sac de texte n'était vidé qu'à la fin d'un round FACTURÉ
         * (`message.updated` avec `finish`) — or un round avorté n'en a pas. Le
         * fragment écrit avant la coupure restait donc dans le sac de la session,
         * et un tour repris derrière (steering : `abort` puis nouveau prompt sur
         * la MÊME session) recollait ce fragment devant tout ce qui suivait : le
         * direct, la réponse du tour, le `summary` et le message de commit.
         *
         * Il est gardé comme dernier texte connu, exactement comme une fin de
         * round : quand la coupure TERMINE le tour (« Stop », plafond, deadline),
         * c'est encore ce que l'agent a dit de plus récent.
         */
        const cut = liveTextOf(state, sessionId);
        if (cut.trim()) state.lastRoundText.set(sessionId, cut);
        partsOf(state, sessionId).clear();
        return { sessionId, events: [], aborted: true };
      }
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
      const files = permissionFiles(metadata);
      const url = permissionUrl(props, metadata);
      const filepath = permissionPath(props, metadata);
      return {
        sessionId,
        events: [],
        permission: {
          id,
          sessionId,
          permission: String(props.permission ?? ""),
          callId: String(tool.callID ?? ""),
          ...(typeof metadata.command === "string" ? { command: metadata.command } : {}),
          ...(filepath ? { filepath } : {}),
          ...(files.length > 0 ? { files } : {}),
          ...(url ? { url } : {}),
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
 * LA RÉFLEXION QUI CONTINUE — ce qu'un delta de part `reasoning` apprend.
 *
 * Il n'y a rien à ranger : le texte de la réflexion n'est ni streamé ni gardé
 * (il arrivera d'un coup, replié, avec le `thinking` de fin de part). Ce qui sort
 * d'ici est le seul fait utile : ça pense, et depuis quand.
 */
function reasoningTick(state: TurnStreamState, partId: string): { active: boolean; startedAt: number } {
  return { active: true, startedAt: state.reasoningStart.get(partId) ?? 0 };
}

/**
 * UN PART DE RÉFLEXION, à son ouverture puis à sa fermeture.
 *
 * `time.start` / `time.end` viennent d'opencode, et c'est voulu : ce module reste
 * SANS HORLOGE, donc testable sur des fixtures rejouées à l'identique. La durée
 * affichée par le fil est ainsi celle qu'a mesurée le serveur, pas celle qu'a mise
 * notre traduction à passer.
 *
 * Le part est aussi RETIRÉ du sac de texte : si un delta est arrivé avant la frame
 * d'ouverture (rien ne le garantit dans l'autre sens), la chaîne de pensée serait
 * déjà entrée dans la réponse du round.
 */
function reasoningPart(
  state: TurnStreamState,
  sessionId: string,
  part: Record<string, unknown>,
  partId: string,
): Translation {
  if (!partId) return { sessionId, events: [] };
  state.partKind.set(partId, "reasoning");
  partsOf(state, sessionId).delete(partId);

  const time = (part.time ?? {}) as Record<string, unknown>;
  const start = typeof time.start === "number" ? time.start : 0;
  if (start && !state.reasoningStart.has(partId)) state.reasoningStart.set(partId, start);
  const end = typeof time.end === "number" ? time.end : 0;
  if (!end) return { sessionId, events: [], reasoning: reasoningTick(state, partId) };

  // Le part est clos : sa trace part au fil sous le MÊME type et la MÊME forme que
  // celle de la boucle maison (`thinking` + `kind: "reasoning"`), pour que le fil
  // la replie comme avant et qu'un run d'il y a trois mois se relise pareil.
  const text = typeof part.text === "string" ? part.text.trim() : "";
  const durationMs = Math.max(0, end - (state.reasoningStart.get(partId) ?? end));
  return {
    sessionId,
    events: text ? [{ type: "thinking", payload: { kind: "reasoning", text, durationMs } }] : [],
    reasoning: { active: false, startedAt: state.reasoningStart.get(partId) ?? 0 },
  };
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

/**
 * La commande et son code de sortie, lus sur le part d'un `bash` terminé.
 *
 * `undefined` dès qu'un des deux manque — et `exit` manque pour de vrai : la
 * source d'opencode y pose `null` quand la commande a été abandonnée ou tuée par
 * le timeout. Un code de sortie inconnu n'est pas un zéro, et le prendre pour
 * tel ferait taire la porte de livraison sur un tour non vérifié.
 */
function shellOf(
  stateNode: Record<string, unknown>,
  input: Record<string, unknown>,
): { command: string; exit: number } | undefined {
  const metadata = (stateNode.metadata ?? {}) as Record<string, unknown>;
  const exit = metadata.exit;
  const command = typeof input.command === "string" ? input.command.trim() : "";
  if (!command || typeof exit !== "number" || !Number.isFinite(exit)) return undefined;
  return { command, exit };
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
