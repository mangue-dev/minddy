import {
  parseFilesChangedPayload,
  type AgentFileChange,
  type AgentFileChangeStatus,
  type AgentRunEvent,
} from "./agent-api";
import type { FileStatus } from "./pr-file-tree";

/**
 * Dérivations « fichiers changés » d'un run d'agent (MIN-46, note « diff par tour »),
 * partagées entre le fil (bloc SETTLED sous la réponse d'un tour) et la barre
 * au-dessus du composer (bloc LIVE du tour en cours + bouton « créer la PR »).
 *
 * Deux sources, deux fidélités :
 *  • AUTORITAIRE — les events `files_changed`, émis en fin de tour, calculés par git
 *    dans la sandbox (statut + compteurs exacts). C'est la vérité, mais elle n'arrive
 *    qu'une fois le tour terminé.
 *  • APPROXIMATIVE (live) — reconstruite des `tool_call` d'édition du tour EN COURS,
 *    pour montrer « en direct » ce que l'agent touche pendant qu'il travaille (avant
 *    que git n'ait committé). Sans compteurs, statut deviné du tool — `run_command`
 *    peut changer des fichiers hors de cette liste : c'est un indice, pas un décompte.
 */

/** Ordre d'affichage stable des statuts (ajouts d'abord, suppressions ensuite). */
const STATUS_RANK: Record<AgentFileChangeStatus, number> = {
  added: 0,
  modified: 1,
  renamed: 2,
  deleted: 3,
};

function byStatusThenPath(a: AgentFileChange, b: AgentFileChange): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  return r !== 0 ? r : a.path.localeCompare(b.path);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Union des events `files_changed` d'un run → état CUMULÉ de la branche (dernier
 * statut connu par chemin, compteurs du dernier event qui l'a touché). Sert la barre
 * au repos : « N fichiers modifiés · créer une pull request ». `truncated` remonte si
 * un event a été borné (gros tour).
 */
export function cumulativeBranchFiles(events: AgentRunEvent[]): {
  files: AgentFileChange[];
  truncated: boolean;
} {
  const byPath = new Map<string, AgentFileChange>();
  let truncated = false;
  for (const e of events) {
    if (e.type !== "files_changed") continue;
    const parsed = parseFilesChangedPayload(e.payload);
    if (parsed.truncated) truncated = true;
    for (const f of parsed.files) byPath.set(f.path, f);
  }
  return { files: [...byPath.values()].sort(byStatusThenPath), truncated };
}

/** A-t-on au moins un event `files_changed` ? (⇒ le run a committé du code.) */
export function hasCommittedChanges(events: AgentRunEvent[]): boolean {
  return events.some((e) => e.type === "files_changed");
}

/**
 * Le statut d'un fichier dans le vocabulaire des diffs de PR, pour que le bloc
 * d'un tour d'agent porte les mêmes marques qu'eux (icône, couleur, mot). Le
 * seul écart entre les deux nomenclatures : git dit `deleted`, la forge dit
 * `removed`.
 */
export function prFileStatus(status: AgentFileChangeStatus): FileStatus {
  return status === "deleted" ? "removed" : status;
}

/** Totaux +/− d'une liste (0 quand inconnus — vue live). Prend toute liste qui
 *  PORTE ces deux nombres : la même somme sert les fichiers d'un event
 *  `files_changed` et ceux du diff lu dans la microVM, qui parlent la langue des
 *  diffs de forge (`filename`) et pas celle de git (`path`). */
export function changeTotals(
  files: { additions: number; deletions: number }[],
): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  );
}

/** Statistiques d'un fichier renvoyées par la route du diff (forme forge). */
export interface LiveDiffStat {
  filename: string;
  additions: number;
  deletions: number;
  previous_filename?: string;
}

/**
 * Ajoute aux fichiers provisoires du tour les compteurs exacts du diff Git
 * vivant. La liste provisoire reste la source de la portée du tour : le diff
 * vivant couvre aussi les tours précédents de la branche, donc on ne doit pas
 * le rendre directement dans le fil.
 */
export function mergeLiveFileStats(
  liveFiles: AgentFileChange[],
  diffFiles: LiveDiffStat[],
): AgentFileChange[] {
  const statsByPath = new Map<string, LiveDiffStat>();
  for (const file of diffFiles) {
    statsByPath.set(file.filename, file);
    if (file.previous_filename) statsByPath.set(file.previous_filename, file);
  }

  return liveFiles.map((file) => {
    const stat = statsByPath.get(file.path);
    return stat
      ? { ...file, additions: stat.additions, deletions: stat.deletions }
      : file;
  });
}
