import { spawn } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { app } from "electron";

import { childEnv } from "@/lib/desktop/child-env";
import {
  opencodeBin,
  opencodeDecision,
  electronToolShim,
  localRuntimePath,
  npmInvocation,
  readOpencodeManifestVersion,
  type NpmInvocation,
  type OpencodeDecision,
} from "@/lib/desktop/opencode-install";
import {
  OPENCODE_INSTALL_MANIFEST,
  MINDDY_RUNTIME_BIN_ENV,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
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
function npmOnPath(runtimePath: string): string | null {
  for (const dir of runtimePath.split(":")) {
    if (!dir) continue;
    const candidate = `${dir.replace(/\/+$/, "")}/npm`;
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Les gestionnaires Node rangent leurs versions hors du PATH des apps GUI. */
function managedNodeBins(home: string): string[] {
  const bins = [
    `${home}/.volta/bin`,
    `${home}/.asdf/shims`,
    `${home}/.local/share/mise/shims`,
    `${home}/.local/bin`,
  ];
  for (const [root, suffix] of [
    [`${home}/.nvm/versions/node`, "bin"],
    [`${home}/.local/share/fnm/node-versions`, "installation/bin"],
    [`${home}/.fnm/node-versions`, "installation/bin"],
  ] as const) {
    try {
      const versions = readdirSync(root).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      );
      bins.push(...versions.map((version) => `${root}/${version}/${suffix}`));
    } catch {
      // Gestionnaire absent : ce n'est pas une erreur de bootstrap.
    }
  }
  return bins;
}

function bundledNpmCli(): string | null {
  const candidate = path.join(app.getAppPath(), "node_modules", "npm", "bin", "npm-cli.js");
  try {
    accessSync(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Donne au harness de vraies commandes `node` et `npm`, même sans chaîne Node
 * système. Elles exécutent le runtime signé d'Electron ; le shim npm sert aussi
 * aux `npm install` que l'agent lance ensuite dans le dépôt de l'utilisateur.
 */
function electronToolBin(npmCli: string | null): string | null {
  const binDir = path.join(app.getPath("userData"), "agent-runtime", "bin");
  try {
    mkdirSync(binDir, { recursive: true });
    const tools: Array<[string, string[]]> = [["node", []]];
    if (npmCli) tools.push(["npm", [npmCli]]);
    for (const [name, args] of tools) {
      const file = path.join(binDir, name);
      const source = electronToolShim(process.execPath, args);
      try {
        if (readFileSync(file, "utf8") === source) {
          chmodSync(file, 0o700);
          continue;
        }
      } catch {
        // Premier lancement, ou shim d'une version précédente.
      }
      const staged = `${file}.${process.pid}.tmp`;
      writeFileSync(staged, source, { encoding: "utf8", mode: 0o700 });
      renameSync(staged, file);
    }
    return binDir;
  } catch {
    return null;
  }
}

/** Environnement commun au bootstrap, au harness et aux shells des tools. */
export function localRuntimeEnv(): Record<string, string> {
  const env = childEnv(process.env);
  const home = env.HOME ?? app.getPath("home");
  const npmCli = bundledNpmCli();
  const toolBin = electronToolBin(npmCli);
  if (toolBin) env[MINDDY_RUNTIME_BIN_ENV] = toolBin;
  env.PATH = localRuntimePath(env.PATH, [
    ...(toolBin ? [toolBin] : []),
    ...managedNodeBins(home),
  ]);
  const npm = npmInvocation({
    bundledCli: npmCli,
    electronExecutable: process.execPath,
    systemNpm: npmOnPath(env.PATH),
  });
  // `ELECTRON_RUN_AS_NODE` ne doit jamais contaminer le harness ou les tools.
  // Il est ajouté uniquement au process npm, dans `installOpencode` et dans le
  // repli du harness. Seuls les chemins inertes voyagent jusque-là.
  if (npm?.source === "bundled") {
    for (const [key, value] of Object.entries(npm.extraEnv)) {
      if (key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
    }
  }
  return env;
}

function availableNpm(env: Record<string, string>): NpmInvocation | null {
  return npmInvocation({
    bundledCli: bundledNpmCli(),
    electronExecutable: process.execPath,
    systemNpm: npmOnPath(env.PATH),
  });
}

/** Ce que la coquille a lu, prêt pour la décision. */
export function readOpencodeFacts(installDir: string): {
  decision: OpencodeDecision;
  npm: NpmInvocation | null;
  env: Record<string, string>;
} {
  const env = localRuntimeEnv();
  const npm = availableNpm(env);
  let installedVersion: string | null = null;
  let pluginVersion: string | null = null;
  try {
    installedVersion = readOpencodeManifestVersion(
      readFileSync(opencodePackageManifestPath(installDir), "utf8"),
    );
  } catch {
    // Pas de paquet : `installedVersion` reste `null`, et la décision le lit.
  }
  try {
    pluginVersion = readOpencodeManifestVersion(
      readFileSync(opencodePluginManifestPath(installDir), "utf8"),
    );
  } catch {
    // Une installation antérieure à ce cache n'avait que le binaire.
  }
  return {
    decision: opencodeDecision({
      installedVersion,
      pluginVersion,
      binaryPresent: isExecutable(opencodeBin(installDir)),
      npmAvailable: npm !== null,
    }),
    npm,
    env,
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
  npm: NpmInvocation;
  env: Record<string, string>;
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
    const childEnv = { ...opts.env, ...opts.npm.extraEnv };
    const runtimeBin = childEnv[MINDDY_RUNTIME_BIN_ENV];
    if (opts.npm.source === "bundled" && runtimeBin) {
      childEnv.PATH = `${runtimeBin}:${childEnv.PATH ?? ""}`;
    }
    const child = spawn(
      opts.npm.executable,
      [...opts.npm.argsPrefix, ...opencodeInstallArgs(opts.installDir)],
      {
        cwd: opts.installDir,
        stdio: ["ignore", "ignore", "pipe"],
        // Un `npm` qui hériterait de l'environnement d'Electron peut trouver un
        // `NODE_OPTIONS` qui ne le concerne pas et le faire échouer d'une façon
        // incompréhensible. `ELECTRON_RUN_AS_NODE`, lui, n'est réintroduit que
        // pour le npm embarqué, après le filtrage de `childEnv`.
        env: childEnv,
      },
    );

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
