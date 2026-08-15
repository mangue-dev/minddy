import { spawn } from "node:child_process";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { HarnessLayout } from "../harness-layout";
import { forgetHarnessChild, noteHarnessChild } from "./child-registry";
import { OpencodeClient } from "./opencode-client";
import {
  OPENCODE_INSTALL_MANIFEST,
  OPENCODE_VERSION,
  MINDDY_RUNTIME_BIN_ENV,
  opencodeBin,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodeNpmProgram,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
} from "./opencode-version";
import type { SupervisorDeps } from "./supervisor";

/**
 * COMMENT ON TIENT UN SERVEUR OPENCODE VIVANT DANS LA MICROVM (MIN-286, lot 3).
 *
 * Le superviseur ne sait rien de tout ça, et c'est voulu : il reçoit
 * `startServer` / `writeFile` / `client` en dépendances, ce qui lui permet d'être
 * testé sans faire tourner 144 Mo de binaire. Ce fichier est la seule
 * implémentation RÉELLE de ces trois-là, et il ne vit que dans la VM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOSES MESURÉES QUI DÉCIDENT DE SA FORME (lot 0, §2.7)
 *
 * 1. **Le serveur doit rester au PREMIER PLAN d'un process qui vit.** Un
 *    `nohup … &` dans un `sh -c` du Sandbox fait tomber la commande RPC
 *    (`UND_ERR_SOCKET` en ~25 s, zéro ligne de sortie, `detached: true` n'y change
 *    rien). Ici on n'est plus dans une commande RPC : on est DANS la microVM, dans
 *    le process node du harness, qui vit tant que le tour vit. `spawn` d'un
 *    enfant ordinaire suffit donc.
 *
 *    ⚠ **CORRECTION (MIN-293) : « l'enfant meurt avec nous » était faux.** Cette
 *    ligne disait la garantie qu'on voulait, pas celle qu'on avait. Sur POSIX un
 *    enfant n'est pas tué quand son parent meurt, il est réparenté ; ce qui tue
 *    celui-ci, c'est le `finally` du superviseur — donc rien du tout quand le
 *    harness est tué net. Dans une microVM, sans conséquence : la machine meurt à
 *    la fin du tour. **Sur un Mac, c'est 143 Mo et un port tenu, et le tour
 *    suivant échoue sur un `listen` refusé.** D'où l'inscription au registre
 *    ci-dessous, que le lanceur relit pour finir le travail
 *    ([child-registry.ts](child-registry.ts)).
 * 2. **L'installation coûte 10,6 s / 351 Mo, le démarrage 1,3 s.** D'où la forme :
 *    on installe SEULEMENT si le binaire manque. Cuit dans
 *    `AGENT_SANDBOX_SNAPSHOT_ID` par
 *    [scripts/create-agent-snapshot.ts](../../../../scripts/create-agent-snapshot.ts),
 *    il ne manque jamais et un tour neuf paie 1,3 s ; sans snapshot à jour, le
 *    repli ci-dessous fonctionne quand même, il coûte dix secondes.
 *    **Un changement d'`OPENCODE_VERSION` périme le snapshot** : le binaire cuit
 *    n'est plus celui qu'on veut, et comme il ne manque pas, personne ne
 *    l'installera. Rejouer le script après tout bump — c'est écrit dedans.
 * 3. **La version est ÉPINGLÉE.** C'est le harness du produit : une mise à jour
 *    qui arriverait d'elle-même changerait de moteur au milieu d'un run (l'auto-update
 *    est éteint par `opencodeServerEnv`, cette épingle-ci en est le pendant à
 *    l'installation).
 */

export { opencodeBin, OPENCODE_VERSION };

async function exists(path: string): Promise<boolean> {
  return await access(path).then(
    () => true,
    () => false,
  );
}

/**
 * La version RÉELLEMENT posée dans le dossier d'installation, lue sur le disque —
 * `null` si rien n'est installé, ou si le paquet est là sans son manifeste.
 *
 * On la lit plutôt que d'exécuter `opencode --version` : un `spawn` de 144 Mo de
 * binaire natif à chaque tour pour apprendre un numéro qui est écrit dans un
 * fichier de 2 Ko, c'est cher pour la même réponse.
 */
async function packageVersion(manifestPath: string): Promise<string | null> {
  try {
    const manifest = await readFile(manifestPath, "utf8");
    const version = (JSON.parse(manifest) as { version?: string }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * `npm i` du binaire, et seulement s'il manque **ou s'il n'est pas le nôtre**
 * (cf. §2 et §3 ci-dessus).
 *
 * LA DEUXIÈME MOITIÉ DE CETTE CONDITION EST CE QUI TIENT L'ÉPINGLE. Un snapshot
 * pré-chauffé est cuit une fois puis oublié : le jour où `OPENCODE_VERSION`
 * bouge, un test d'existence seul verrait le binaire d'hier, le trouverait très
 * bien, et tous les runs tourneraient sur l'ancien moteur pendant que le dépôt
 * jure le contraire — sans une ligne de log pour le dire. On compare donc au
 * numéro écrit sur le disque, et une divergence réinstalle (dix secondes, une
 * fois, jusqu'à ce que le snapshot soit rejoué).
 */
async function ensureInstalled(installDir: string): Promise<void> {
  const [found, plugin] = await Promise.all([
    packageVersion(opencodePackageManifestPath(installDir)),
    packageVersion(opencodePluginManifestPath(installDir)),
  ]);
  if (
    found === OPENCODE_VERSION &&
    plugin === OPENCODE_VERSION &&
    (await exists(opencodeBin(installDir)))
  ) {
    return;
  }
  if (found && found !== OPENCODE_VERSION) {
    console.log(
      `[opencode] version ${found} installée, ${OPENCODE_VERSION} attendue — réinstallation ` +
        `(snapshot AGENT_SANDBOX_SNAPSHOT_ID à rejouer : scripts/create-agent-snapshot.ts)`,
    );
  }
  await mkdir(installDir, { recursive: true });
  /**
   * ⚠ **LE `package.json` AVANT L'INSTALL, ET CE N'EST PAS DÉCORATIF** (MIN-293).
   *
   * Sans lui, `npm` REMONTE l'arborescence jusqu'au premier `package.json` qu'il
   * trouve et installe DEDANS — en rendant 0. Mesuré sur un Mac : 144 Mo posés
   * dans `~/node_modules`, `opencode-ai` ajouté aux dépendances du home, et ce
   * dossier-ci laissé vide. Le détail et les deux garde-fous sont dans
   * [opencode-version.ts](opencode-version.ts).
   */
  await writeFile(opencodeInstallManifestPath(installDir), OPENCODE_INSTALL_MANIFEST, "utf8");
  await new Promise<void>((resolve, reject) => {
    const npm = opencodeNpmProgram(process.env);
    const installEnv = npm.electronRunAsNode
      ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
      : process.env;
    const runtimeBin = process.env[MINDDY_RUNTIME_BIN_ENV]?.trim();
    if (npm.electronRunAsNode && runtimeBin) {
      installEnv.PATH = `${runtimeBin}:${installEnv.PATH ?? ""}`;
    }
    const child = spawn(
      npm.executable,
      [...npm.argsPrefix, ...opencodeInstallArgs(installDir)],
      {
        cwd: installDir,
        stdio: ["ignore", "ignore", "pipe"],
        env: installEnv,
      },
    );
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`opencode install failed (exit ${code}): ${err.slice(-500)}`)),
    );
  });

  /**
   * **UN `npm` QUI REND 0 NE PROUVE PAS QUE LE BINAIRE EST LÀ** (MIN-293) — c'est
   * exactement ce qui est arrivé. On relit donc le disque, et on lève ici plutôt
   * que de laisser `spawn` échouer en `ENOENT` trois lignes plus loin, où le
   * message ne nomme plus la cause.
   */
  if (!(await exists(opencodeBin(installDir)))) {
    throw new Error(
      `opencode install reported success but ${opencodeBin(installDir)} is missing — ` +
        `check that npm installed into ${installDir} and not into a parent package`,
    );
  }
}

async function prepareToolRuntime(layout: HarnessLayout): Promise<void> {
  const runtimeDir = `${layout.harnessDir}/config/opencode`;
  await mkdir(runtimeDir, { recursive: true });
  // OpenCode demande à son gestionnaire de paquets de « préparer » chaque
  // dossier qui porte des tools. Lier uniquement node_modules ne suffit pas :
  // voyant un manifeste différent et aucun lock, npm remplaçait le lien par
  // une copie de 61 Mo. Les trois entrées décrivent maintenant exactement le
  // même projet déjà installé ; la préparation devient un no-op local.
  for (const [name, type] of [
    ["package.json", "file"],
    ["package-lock.json", "file"],
    ["node_modules", "dir"],
  ] as const) {
    try {
      await symlink(`${layout.opencodeDir}/${name}`, `${runtimeDir}/${name}`, type);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/**
 * Les dépendances RÉELLES du superviseur : un serveur qu'on démarre, des fichiers
 * qu'on écrit, un client HTTP.
 *
 * `port` est RÉSERVÉ par l'appelant (MIN-354, cf. [free-port.ts](free-port.ts)) :
 * il valait 4096 en dur tant que la microVM était à nous seuls, et deux runs sur
 * une même machine s'y seraient disputé la même socket.
 *
 * `layout` donne les deux choses que ce module ne peut pas deviner : où le
 * binaire est installé, et quel dépôt le client déclare en `directory`.
 */
export function opencodeSupervisorDeps(opts: { port: number; layout: HarnessLayout }): Pick<
  SupervisorDeps,
  "startServer" | "writeFile" | "client"
> {
  const { port, layout } = opts;
  return {
    startServer: async (env) => {
      await ensureInstalled(layout.opencodeDir);
      await prepareToolRuntime(layout);
      const bin = opencodeBin(layout.opencodeDir);
      const child = spawn(bin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
        // L'environnement du harness PLUS celui du tour : `opencodeServerEnv` ne
        // porte que la config et les dossiers, or le binaire a encore besoin d'un
        // `PATH` et d'un `HOME` pour lancer le shell des tools.
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      /**
       * INSCRIT AVANT DE SERVIR (MIN-293), et c'est l'ordre qui fait la garantie :
       * un process tué entre son `spawn` et son inscription est exactement
       * l'orphelin qu'on cherche à ne plus produire. Sans effet en microVM — le
       * lanceur qui relit ce fichier est celui du Mac, et une VM jetable n'a rien
       * à nettoyer.
       */
      if (child.pid) {
        noteHarnessChild(layout.harnessDir, {
          pid: child.pid,
          kind: "opencode",
          label: `opencode serve --port ${port}`,
        });
      }
      /**
       * LES DEUX TUBES SONT LUS, et pas par curiosité : un enfant dont personne
       * ne lit la sortie finit par bloquer sur un tube plein — un serveur qui
       * journalise pendant des heures y arrive. On les préfixe et on les laisse
       * partir dans notre propre sortie, qui est celle que la microVM garde.
       */
      const log = (prefix: string) => (chunk: Buffer) => {
        const text = chunk.toString().trimEnd();
        if (text) console.log(`[opencode:${prefix}] ${text.slice(0, 2000)}`);
      };
      child.stdout?.on("data", log("out"));
      child.stderr?.on("data", log("err"));

      /**
       * ⚠ **UN SPAWN QUI ÉCHOUE EST UN FAIT, PAS UNE LENTEUR** (MIN-293).
       *
       * Avant, l'échec ne faisait qu'une ligne de `console.error` et la fonction
       * rendait quand même son `stop` : le superviseur partait alors attendre un
       * serveur qui n'existerait jamais, en annonçant « still waiting for the
       * server (15 s… 30 s… 45 s) » jusqu'à son plafond. Le seul message que
       * l'utilisateur voyait parlait donc de LENTEUR, pour un binaire absent.
       *
       * `spawn` et `error` sont exclusifs et exactement l'un des deux arrive :
       * on attend celui qui vient, et on LÈVE sur l'échec. Le tour se termine
       * alors en erreur, avec la vraie cause, dans la seconde.
       */
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", (err) =>
          reject(new Error(`opencode could not start (${bin}): ${err.message}`)),
        );
      });
      child.on("error", (err) => console.error("[opencode] runtime error:", err.message));
      return {
        stop: async () => {
          // Désinscrit d'abord, quel que soit l'état : à partir d'ici, ce pid est
          // notre affaire et plus celle du lanceur. Un pid recyclé par le système
          // entre deux tours désignerait sinon le process de quelqu'un d'autre.
          if (child.pid) forgetHarnessChild(layout.harnessDir, child.pid);
          if (child.exitCode !== null || child.signalCode !== null) return;
          /**
           * `SIGTERM` puis, s'il s'accroche, `SIGKILL`. Le serveur tient une base
           * SQLite : lui laisser une seconde pour la fermer proprement évite un
           * journal WAL en vrac que le tour suivant rejouerait.
           */
          child.kill("SIGTERM");
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 1_000);
            child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
          });
        },
      };
    },

    writeFile: async (path, content) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },

    // `directory` est le dépôt : toutes les routes héritées d'opencode le veulent
    // en query, et c'est lui qui donne au serveur son identité de projet (le hash
    // du premier commit — cf. la sonde de reprise du lot 0).
    client: (baseUrl) => new OpencodeClient({ baseUrl, directory: layout.repoDir }),
  };
}
