import {
  parseFilesChangedPayload,
  type AgentFileChange,
  type AgentFileChangeStatus,
  type AgentRunEvent,
} from "./agent-api";

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

/** Statut deviné d'un `tool_call` d'édition (approximation live). */
function statusForEditTool(name: string): AgentFileChangeStatus | null {
  switch (name) {
    case "write_file":
      return "added";
    case "delete_file":
      return "deleted";
    case "move_file":
      return "renamed";
    case "edit_file":
    case "apply_edits":
      return "modified";
    default:
      return null;
  }
}

/**
 * Fichiers touchés par le tour EN COURS, reconstruits des `tool_call` d'édition émis
 * APRÈS la dernière frontière de tour (message utilisateur de steering, ou résumé qui
 * clôt le tour précédent). Approximatif et sans compteurs — remplacé par l'event
 * autoritaire dès que le tour se termine. Retourne `[]` si rien n'a encore été touché.
 */
export function liveTurnFiles(events: AgentRunEvent[]): AgentFileChange[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  // Début du tour courant : juste après la dernière frontière (steering ou résumé).
  let start = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].type === "user_message" || ordered[i].type === "summary") {
      start = i + 1;
      break;
    }
  }

  // Map chemin → changement, sans rétrograder un `added`/`deleted` en `modified`.
  const byPath = new Map<string, AgentFileChange>();
  const put = (path: string, status: AgentFileChangeStatus, previousPath?: string) => {
    if (!path) return;
    const prev = byPath.get(path);
    if (prev && (prev.status === "added" || prev.status === "deleted") && status === "modified") {
      return;
    }
    byPath.set(path, {
      path,
      status,
      additions: 0,
      deletions: 0,
      ...(previousPath ? { previousPath } : {}),
    });
  };

  for (let i = start; i < ordered.length; i++) {
    const e = ordered[i];
    if (e.type !== "tool_call") continue;
    const p = e.payload ?? {};
    const name = str(p.name);
    const status = statusForEditTool(name);
    if (!status) continue;
    if (name === "move_file") {
      put(str(p.to), "renamed", str(p.from) || undefined);
    } else if (name === "apply_edits") {
      const paths = Array.isArray(p.paths) ? p.paths : [];
      for (const raw of paths) put(str(raw), "modified");
    } else {
      put(str(p.path), status);
    }
  }

  return [...byPath.values()].sort(byStatusThenPath);
}

/** A-t-on au moins un event `files_changed` ? (⇒ le run a committé du code.) */
export function hasCommittedChanges(events: AgentRunEvent[]): boolean {
  return events.some((e) => e.type === "files_changed");
}

/** Totaux +/− d'une liste (0 quand inconnus — vue live). */
export function changeTotals(files: AgentFileChange[]): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  );
}
