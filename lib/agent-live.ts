import {
  parseFilesChangedPayload,
  type AgentEventType,
  type AgentFileChange,
} from "./agent-api";

/**
 * CE QUE LE FIL AFFICHE DU ROUND EN COURS, et les deux règles qui le font changer.
 *
 * À part de [use-agent-run-live.ts](use-agent-run-live.ts), qui garde le canal, le
 * cache et l'ordonnancement : ce qui reste ici est PUR, donc exerçable. La suite
 * n'a pas de rendu React, et c'est précisément ce qui a laissé passer la première
 * version de MIN-248 bis — la moitié client de la feature n'avait aucun test.
 */

export interface AgentRunLive {
  /** Réponse du modèle telle qu'écrite jusqu'ici. */
  text: string;
  /** Appels d'outils déjà amorcés dans ce round : >0 ⇒ narration, le tour continue. */
  tools: number;
  /** Le modèle raisonne EN CE MOMENT (MIN-122) → indicateur + compteur dans le fil.
   *  Le TEXTE du raisonnement n'est PAS streamé : il arrive persisté en fin de round. */
  reasoningActive: boolean;
  /** Millisecondes de réflexion de ce round, mesurées côté serveur (le compteur). */
  reasoningMs: number;
  /** ISO — premier instant où ce round a écrit quelque chose (chrono du tour). */
  startedAt: string;
  /**
   * Fichiers touchés jusqu'ici par le tour, PROVISOIRES : le serveur en renvoie la
   * liste ENTIÈRE à chaque charge, donc celle-ci fait foi sans qu'on ait à fusionner.
   * `additions`/`deletions` y valent 0 — le direct ne fait que signaler les chemins.
   * Le fil les enrichit avec le diff statistique Git vivant quand il est disponible,
   * et un compteur encore à zéro se tait (`hideEmpty`) plutôt que de se lire comme
   * une mesure.
   */
  files: AgentFileChange[];
  /** La liste a été bornée côté serveur (gros tour). */
  filesTruncated: boolean;
  /** Compteurs Git exacts du tour quand ils remontent de l'exécuteur local. */
  fileStats: AgentFileChange[];
}

export interface StreamPayload {
  text?: unknown;
  tools?: unknown;
  reasoningActive?: unknown;
  reasoningMs?: unknown;
  at?: unknown;
  files?: unknown;
  filesTruncated?: unknown;
  fileStats?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Une charge de direct appliquée à l'état du fil. `null` = plus rien à montrer.
 *
 * Une charge est un INSTANTANÉ complet du round : ce qu'elle tait, on l'efface.
 * Rien n'est fusionné avec `prev` sauf le chrono, qui date du PREMIER signe de vie
 * du round et pas du dernier.
 */
export function liveFromStream(
  prev: AgentRunLive | null,
  payload: StreamPayload,
  now: () => string = () => new Date().toISOString(),
): AgentRunLive | null {
  const text = str(payload.text);
  const tools = typeof payload.tools === "number" ? payload.tools : 0;
  const reasoningActive = payload.reasoningActive === true;
  const reasoningMs = typeof payload.reasoningMs === "number" ? payload.reasoningMs : 0;
  // La MÊME lecture que celle de l'event `files_changed` (`agent-api`) : deux
  // parseurs pour un même payload finissent toujours par diverger, et le second
  // perdait déjà les statuts et les compteurs du premier.
  const { files: announcedFiles, truncated } = parseFilesChangedPayload({
    files: payload.files,
    truncated: payload.filesTruncated,
  });
  const { files: fileStats } = parseFilesChangedPayload({ files: payload.fileStats });
  // L'outil intégré annonce son chemin dès que l'écriture est autorisée. Le
  // relevé Git arrive un peu après, une fois l'écriture réellement posée ; il
  // attrape aussi les modifications faites par une commande shell.
  const files = announcedFiles.length > 0 ? announcedFiles : fileStats;
  // Envoi À VIDE : les vrais events du round sont posés, ils prennent le relais à
  // l'écran. Une phase de PURE réflexion n'écrit ni texte ni outil — sans
  // `reasoningActive` dans ce test, l'indicateur disparaîtrait au lieu de
  // s'afficher. Les fichiers comptent comme un signe de vie : la charge qui les
  // porte est justement celle d'un round au repos.
  if (!text && !tools && !reasoningActive && files.length === 0 && fileStats.length === 0) return null;
  return {
    text,
    tools,
    reasoningActive,
    reasoningMs,
    files,
    filesTruncated: truncated,
    fileStats,
    startedAt: prev?.startedAt ?? now(),
  };
}

/**
 * L'état du fil quand un event est POSÉ. Le provisoire s'efface : le vrai message
 * arrive, et sans ça les deux se superposeraient le temps que le serveur envoie sa
 * purge (un insert plus tard).
 *
 * Les FICHIERS, eux, restent. Aucun event posé ne les remplace avant le
 * `files_changed` de fin de tour : les effacer à chaque `tool_call` les faisait
 * disparaître pendant toute la phase d'outils, celle-là même où l'agent édite et
 * où on veut les voir.
 *
 * Sauf `files_changed`, justement — c'est LUI l'autorité, et son arrivée est le
 * passage de relais. Le déclarer ICI plutôt que d'attendre une charge de purge,
 * parce qu'il n'en vient pas toujours une : quand la boucle tourne dans la microVM,
 * l'event est posé par la fonction APRÈS que le tour a rendu son rapport, et il n'y
 * a plus personne dans la VM pour diffuser l'oubli. Les deux listes se seraient
 * superposées jusqu'à la fin du run.
 *
 * Et sauf ce qui CLÔT LE TOUR (`summary`, `quota_exhausted`) : la liste vivante
 * appartient au tour en cours, elle ne lui survit pas. Elle le faisait, le temps que
 * le `files_changed` de fin de tour arrive — et le fil, qui range ce qui suit une
 * réponse dans un tour NEUF, ouvrait un second accordéon sous celle-ci, chrono
 * compris : le tour se lisait en double.
 */
const CLOSES_TURN: ReadonlySet<AgentEventType> = new Set<AgentEventType>([
  "files_changed",
  "summary",
  "quota_exhausted",
]);

export function liveAfterEvent(
  prev: AgentRunLive | null,
  type: AgentEventType,
): AgentRunLive | null {
  if (!prev || prev.files.length === 0 || CLOSES_TURN.has(type)) return null;
  return { ...prev, text: "", tools: 0, reasoningActive: false };
}
