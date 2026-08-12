import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { OpencodeClient } from "./opencode-client";
import { OPENCODE_BIN, OPENCODE_INSTALL_DIR, OPENCODE_VERSION } from "./opencode-version";
import { OPENCODE_DIRECTORY, type SupervisorDeps } from "./supervisor";

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
 *    enfant ordinaire suffit donc, et l'enfant meurt avec nous — ce qui est
 *    exactement la garantie qu'on veut : pas de serveur orphelin entre deux tours.
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

export { OPENCODE_BIN, OPENCODE_INSTALL_DIR, OPENCODE_VERSION };

async function exists(path: string): Promise<boolean> {
  return await access(path).then(
    () => true,
    () => false,
  );
}

/**
 * La version RÉELLEMENT posée dans `/vercel/oc`, lue sur le disque — `null` si
 * rien n'est installé, ou si le paquet est là sans son manifeste.
 *
 * On la lit plutôt que d'exécuter `opencode --version` : un `spawn` de 144 Mo de
 * binaire natif à chaque tour pour apprendre un numéro qui est écrit dans un
 * fichier de 2 Ko, c'est cher pour la même réponse.
 */
async function installedVersion(): Promise<string | null> {
  try {
    const manifest = await readFile(
      `${OPENCODE_INSTALL_DIR}/node_modules/opencode-ai/package.json`,
      "utf8",
    );
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
async function ensureInstalled(): Promise<void> {
  const found = await installedVersion();
  if (found === OPENCODE_VERSION && (await exists(OPENCODE_BIN))) return;
  if (found && found !== OPENCODE_VERSION) {
    console.log(
      `[opencode] version ${found} installée, ${OPENCODE_VERSION} attendue — réinstallation ` +
        `(snapshot AGENT_SANDBOX_SNAPSHOT_ID à rejouer : scripts/create-agent-snapshot.ts)`,
    );
  }
  await mkdir(OPENCODE_INSTALL_DIR, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npm",
      ["i", "--no-audit", "--no-fund", "--silent", `opencode-ai@${OPENCODE_VERSION}`],
      { cwd: OPENCODE_INSTALL_DIR, stdio: ["ignore", "ignore", "pipe"] },
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
}

/**
 * Les dépendances RÉELLES du superviseur : un serveur qu'on démarre, des fichiers
 * qu'on écrit, un client HTTP.
 *
 * `port` est un argument parce que le superviseur en connaît un seul (`OPENCODE_PORT`)
 * et qu'un test pourrait en vouloir un autre sans réécrire ce module.
 */
export function opencodeSupervisorDeps(port: number): Pick<
  SupervisorDeps,
  "startServer" | "writeFile" | "client"
> {
  return {
    startServer: async (env) => {
      await ensureInstalled();
      const child = spawn(OPENCODE_BIN, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
        // L'environnement du harness PLUS celui du tour : `opencodeServerEnv` ne
        // porte que la config et les dossiers, or le binaire a encore besoin d'un
        // `PATH` et d'un `HOME` pour lancer le shell des tools.
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
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
      child.on("error", (err) => console.error("[opencode] spawn failed:", err.message));
      return {
        stop: async () => {
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
    client: (baseUrl) => new OpencodeClient({ baseUrl, directory: OPENCODE_DIRECTORY }),
  };
}
