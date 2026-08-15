import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

import {
  RUN_LOG_DIR_NAME,
  RUN_LOG_REPORT_LINES,
  formatDiagnosticReport,
  pruneRunLogs,
  readRunLogHeader,
  runLogFileName,
  runLogHeader,
  runLogRedactor,
  tagRunLogChunk,
  tailLines,
  type DiagnosticFacts,
  type RunLogFacts,
} from "@/lib/desktop/run-log";
import { OPENCODE_VERSION } from "@/lib/server/agent/vm/opencode-version";

/**
 * LE `fs` DU JOURNAL D'UN TOUR LOCAL (MIN-363) — et rien d'autre.
 *
 * Toutes les décisions (nommage, rotation, en-tête, substitution, forme du
 * rapport) vivent dans [@/lib/desktop/run-log](../../lib/desktop/run-log.ts),
 * avec leur test. Ici il n'y a que le disque, le dossier de données et l'horloge.
 *
 * **Ce fichier existe AVANT le lanceur, et c'est délibéré.** Le lanceur de
 * MIN-293 n'a plus qu'à ouvrir un journal et brancher les deux flux de son
 * `utilityProcess` dessus :
 *
 * ```ts
 * const log = openRunLog({ runId, appVersion: app.getVersion(), bundleVersion,
 *                          opencodeVersion: OPENCODE_VERSION, repoPath },
 *                        [controlToken]);
 * child.stdout?.on("data", (c: Buffer) => log.write(c.toString("utf8"), "out"));
 * child.stderr?.on("data", (c: Buffer) => log.write(c.toString("utf8"), "err"));
 * child.on("exit", (code) => log.close(`exit ${code}`));
 * ```
 *
 * **Rien ici ne lève.** Un disque plein, un dossier en lecture seule ou un
 * fichier verrouillé ne doivent pas faire tomber un tour : un journal est ce
 * qu'on lit quand ça a raté, pas une raison de rater. Chaque échec est signalé
 * sur `console.error`, où il finit dans les journaux du système.
 */

/** Où vivent les journaux : sous `userData`, à côté du canal et de la session. */
export function runLogDir(): string {
  return path.join(app.getPath("userData"), RUN_LOG_DIR_NAME);
}

/** Un journal ouvert, tel que le lanceur le tiendra. */
export interface RunLog {
  /** Le fichier, pour qu'un message d'erreur puisse le nommer. */
  readonly path: string;
  /** Un morceau de sortie de l'enfant. Ne lève jamais. */
  write(chunk: string, stream: "out" | "err"): void;
  /** Ferme le journal en y écrivant le mot de la fin (code de sortie, motif). */
  close(note?: string): void;
}

/**
 * Ouvre le journal d'un tour : crée le dossier, écrit l'en-tête, fait tourner
 * les anciens, et rend le puits.
 *
 * `secrets` porte ce que le tour détient et que le journal ne doit pas garder —
 * le jeton d'exécution locale, la clé mintée du modèle. La substitution est
 * posée à l'écriture : c'est le seul moment où l'on est sûr que l'octet n'a pas
 * encore touché le disque.
 */
export function openRunLog(
  facts: RunLogFacts,
  secrets: readonly (string | null | undefined)[] = [],
): RunLog {
  const startedAt = new Date();
  const dir = runLogDir();
  const file = path.join(dir, runLogFileName(facts.runId, startedAt));
  const redact = runLogRedactor(secrets);

  // Le fichier d'abord, la rotation ensuite : le journal du tour qui commence ne
  // doit pas dépendre du succès d'un ménage.
  let handle: number | null = null;
  try {
    mkdirSync(dir, { recursive: true });
    handle = openSync(file, "a");
    writeSync(handle, runLogHeader(facts, startedAt));
  } catch (error) {
    console.error("[run-log] journal impossible à ouvrir", error);
  }
  pruneOldRunLogs();

  const append = (text: string) => {
    if (handle === null) return;
    try {
      writeSync(handle, redact(text));
    } catch (error) {
      console.error("[run-log] écriture impossible", error);
    }
  };

  return {
    path: file,
    write: (chunk, stream) => append(tagRunLogChunk(chunk, stream)),
    close: (note) => {
      if (note) append(`\n[minddy] ${note}\n`);
      if (handle === null) return;
      try {
        closeSync(handle);
      } catch {
        // Déjà fermé, ou descripteur invalide : il n'y a rien à réparer.
      }
      handle = null;
    },
  };
}

/** Les journaux du dossier, du plus récent au plus ancien. Vide si illisible. */
function listRunLogs(): Array<{ name: string; bytes: number }> {
  try {
    return readdirSync(runLogDir())
      .filter((name) => name.endsWith(".log"))
      .map((name) => {
        try {
          return { name, bytes: statSync(path.join(runLogDir(), name)).size };
        } catch {
          return { name, bytes: 0 };
        }
      })
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  } catch {
    return [];
  }
}

/** Applique la rotation. Un fichier qui résiste est sauté, pas fatal. */
function pruneOldRunLogs(): void {
  for (const name of pruneRunLogs(listRunLogs())) {
    try {
      rmSync(path.join(runLogDir(), name));
    } catch (error) {
      console.error("[run-log] rotation impossible", name, error);
    }
  }
}

/**
 * CE QUE LE RAPPORT DE DIAGNOSTIC EMPORTE, ramassé sur le disque.
 *
 * Le dernier journal donne quatre des cinq faits (bundle, dépôt, run, date) : ils
 * ne sont connus que d'un tour, et l'app ne les porte pas entre deux lancements.
 * Quand il n'y en a aucun, le rapport le dit — c'est déjà une réponse.
 */
export function collectDiagnostic(): DiagnosticFacts {
  const logs = listRunLogs();
  const latest = logs[0];
  let lastRun: DiagnosticFacts["lastRun"] = null;

  if (latest) {
    try {
      const text = readFileSync(path.join(runLogDir(), latest.name), "utf8");
      lastRun = {
        fileName: latest.name,
        header: readRunLogHeader(text),
        tail: tailLines(text, RUN_LOG_REPORT_LINES),
      };
    } catch (error) {
      console.error("[run-log] dernier journal illisible", error);
    }
  }

  return {
    appVersion: app.getVersion(),
    opencodeVersion: OPENCODE_VERSION,
    platform: `${process.platform} ${os.release()}`,
    generatedAt: new Date(),
    logDir: runLogDir(),
    logCount: logs.length,
    lastRun,
  };
}

/** Le rapport, prêt pour le presse-papier. Il ne part JAMAIS tout seul. */
export function diagnosticReport(): string {
  return formatDiagnosticReport(collectDiagnostic());
}

/**
 * Le journal du LANCEUR lui-même, hors de tout tour — pour ce qui rate avant
 * qu'un `runId` existe (pas de dépôt attaché, bundle refusé, opencode absent).
 * Il n'a pas d'en-tête de run à écrire ; il en porte un minimal.
 */
export function noteLauncherFailure(message: string): void {
  const log = openRunLog({
    runId: "launcher",
    appVersion: app.getVersion(),
    bundleVersion: "—",
    opencodeVersion: OPENCODE_VERSION,
    repoPath: "—",
  });
  log.write(message, "err");
  log.close("launcher aborted before the harness started");
}
