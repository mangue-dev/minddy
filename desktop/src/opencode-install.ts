import { spawn } from "node:child_process";
import { accessSync, constants, readFileSync, writeFileSync } from "node:fs";

import { childEnv } from "@/lib/desktop/child-env";
import {
  opencodeBin,
  opencodeDecision,
  readOpencodeManifestVersion,
  type OpencodeDecision,
} from "@/lib/desktop/opencode-install";
import {
  OPENCODE_INSTALL_MANIFEST,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodePackageManifestPath,
} from "@/lib/server/agent/vm/opencode-version";

/**
 * LE `fs` ET LE `spawn` DU PRÉ-VOL OPENCODE (MIN-293) — et rien d'autre.
 *
 * Toutes les décisions (faut-il installer, quelle commande, quel refus, quelle
 * phrase) vivent dans [@/lib/desktop/opencode-install](../../lib/desktop/opencode-install.ts),
 * avec leur test. Ici il n'y a que trois lectures de disque, une recherche dans
 * le `PATH` et un `npm`.
 */

/** Le binaire existe-t-il, et le noyau accepterait-il de l'exécuter ? */
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * `npm` est-il là ? On cherche dans le `PATH` **sans lancer `npm --version`** :
 * sur un Mac sans Command Line Tools, invoquer un exécutable absent fait surgir
 * la fenêtre d'installation de Xcode — au milieu d'un lancement de tour, sans que
 * personne l'ait demandé. C'est exactement le piège que `lib/desktop/local-repo.ts`
 * évite déjà en lisant `.git/config` au lieu de lancer `git`.
 */
function npmOnPath(): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = `${dir.replace(/\/+$/, "")}/npm`;
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Ce que la coquille a lu, prêt pour la décision. */
export function readOpencodeFacts(installDir: string): {
  decision: OpencodeDecision;
  npmPath: string | null;
} {
  const npmPath = npmOnPath();
  let installedVersion: string | null = null;
  try {
    installedVersion = readOpencodeManifestVersion(
      readFileSync(opencodePackageManifestPath(installDir), "utf8"),
    );
  } catch {
    // Pas de paquet : `installedVersion` reste `null`, et la décision le lit.
  }
  return {
    decision: opencodeDecision({
      installedVersion,
      binaryPresent: isExecutable(opencodeBin(installDir)),
      npmAvailable: npmPath !== null,
    }),
    npmPath,
  };
}

/**
 * `npm i opencode-ai@<épingle>` dans le dossier de la MACHINE (jamais celui du
 * run : 144 Mo par ticket, sinon).
 *
 * Rend `null` en cas de succès, le message d'erreur sinon — jamais une exception.
 * L'appelant est le lanceur, dont le contrat est de refuser un tour AVANT le fork
 * avec une phrase dans le journal, pas de lever à un endroit où plus personne
 * n'écoute.
 */
export function installOpencode(opts: {
  installDir: string;
  npmPath: string;
  timeoutMs?: number;
}): Promise<string | null> {
  /**
   * ⚠ **LE `package.json` AVANT L'INSTALL** (MIN-293). Sans lui, `npm` remonte
   * l'arborescence jusqu'au premier qu'il trouve et installe DEDANS, en rendant
   * 0 — mesuré : 144 Mo dans `~/node_modules` et ce dossier-ci resté vide. Le
   * `--prefix` de `opencodeInstallArgs` ferme la même porte une seconde fois.
   */
  try {
    writeFileSync(opencodeInstallManifestPath(opts.installDir), OPENCODE_INSTALL_MANIFEST, "utf8");
  } catch (error) {
    return Promise.resolve(`could not prepare ${opts.installDir}: ${(error as Error).message}`);
  }

  return new Promise((resolve) => {
    const child = spawn(opts.npmPath, opencodeInstallArgs(opts.installDir), {
      cwd: opts.installDir,
      stdio: ["ignore", "ignore", "pipe"],
      // Un `npm` qui hériterait de l'environnement d'Electron peut trouver un
      // `NODE_OPTIONS` ou un `ELECTRON_RUN_AS_NODE` qui ne le concernent pas et
      // le font échouer d'une façon incompréhensible. Même fabrique que le
      // harness, pour que la règle n'ait qu'une écriture.
      env: childEnv(process.env),
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Un `npm install` qui n'a pas rendu au bout de cinq minutes ne rendra pas :
    // registre injoignable, proxy d'entreprise qui avale la connexion. Mieux vaut
    // un refus qui se dit qu'un tour bloqué avant d'avoir commencé.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve("opencode install timed out after 5 minutes");
    }, opts.timeoutMs ?? 5 * 60_000);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(`opencode install could not start: ${error.message}`);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(`opencode install failed (exit ${code}): ${stderr.slice(-500)}`);
        return;
      }
      /**
       * **UN `npm` QUI REND 0 NE PROUVE PAS QUE LE BINAIRE EST LÀ**, et c'est
       * exactement ce qui est arrivé : install « réussie », dossier vide, et le
       * pré-vol qui annonçait « prêt » au lanceur. Un pré-vol qui ment est pire
       * que pas de pré-vol — il déplace la panne trois étages plus bas, dans un
       * `spawn ENOENT` que le harness lit comme une lenteur.
       */
      if (!isExecutable(opencodeBin(opts.installDir))) {
        resolve(
          `opencode install reported success but ${opencodeBin(opts.installDir)} is missing — ` +
            `npm may have installed into a parent package instead of ${opts.installDir}`,
        );
        return;
      }
      resolve(null);
    });
  });
}
