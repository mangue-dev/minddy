/**
 * Crée un snapshot Vercel Sandbox pré-provisionné pour l'agent de code (MIN-46),
 * afin d'obtenir un démarrage quasi instantané des runs.
 *
 * Usage (auth via VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID en env) :
 *   npx tsx scripts/create-agent-snapshot.ts
 *
 * Copie ensuite l'id affiché dans AGENT_SANDBOX_SNAPSHOT_ID (Vercel + .env.local).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SNAPSHOT PORTE DEPUIS MIN-286, ET POURQUOI IL CESSE D'ÊTRE OPTIONNEL
 *
 * Il cuit **opencode**, qui est le harness du produit depuis le lot 3. Mesuré
 * dans une vraie microVM `node24` (docs/harness-opencode.md §2.7) :
 * l'installation coûte **10,6 s et 351 Mo**, le démarrage du serveur **1,3 s**.
 * Sans le snapshot, `opencode-host.ts` retombe sur un `npm i` au premier tour —
 * ça marche, et ça paie ces dix secondes sur CHAQUE microVM neuve, avant que le
 * modèle n'ait lu une ligne.
 *
 * **À REJOUER À CHAQUE BUMP D'`OPENCODE_VERSION`.** Le harness compare la version
 * posée sur le disque à son épingle et réinstalle si elle diverge : un snapshot
 * périmé ne casse donc rien, il redevient simplement lent — et il le dit dans les
 * logs de la VM.
 */
import { Sandbox } from "@vercel/sandbox";

import {
  OPENCODE_BIN,
  OPENCODE_INSTALL_DIR,
  OPENCODE_VERSION,
} from "../lib/server/agent/vm/opencode-version";

/** Le runtime du snapshot DOIT être celui des runs (`SANDBOX_RUNTIME`). */
const RUNTIME = "node24";

function credentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

async function main(): Promise<void> {
  const sandbox = await Sandbox.create({
    ...credentials(),
    runtime: RUNTIME,
    // L'installation d'opencode dure ~11 s, mais un registre lent peut tripler ça :
    // la microVM doit vivre plus longtemps que le pire cas, pas que le cas mesuré.
    timeout: 900_000,
  });

  const sh = async (script: string) => {
    const res = await sandbox.runCommand({ cmd: "sh", args: ["-c", script] });
    return { exitCode: res.exitCode, stdout: (await res.stdout()).trim(), stderr: await res.stderr() };
  };

  try {
    // Vérifie l'outillage de base (git + node sont fournis par le runtime node24).
    const tools = await sh("git --version; node --version");
    console.log(tools.stdout.split("\n").join(" · "));

    // Emplacement d'accueil du dépôt (créé une fois pour éviter un mkDir au boot).
    await sandbox.runCommand("mkdir", ["-p", "/vercel/sandbox/repo"]);

    /**
     * OPENCODE, cuit ici une fois pour toutes.
     *
     * `--no-audit --no-fund` parce que ces deux-là ajoutent des allers-retours
     * réseau à une commande dont on ne veut que le contenu du dossier, et que
     * l'audit d'un binaire épinglé ne nous apprendrait rien qu'on puisse faire.
     * Aucune installation en `--global` : le harness cherche le binaire à un
     * chemin précis (`OPENCODE_BIN`), et c'est ce chemin-là qui doit exister au
     * réveil, pas un lien dans un `PATH` que la microVM ne garantit pas.
     */
    console.log(`\n⏳ npm i opencode-ai@${OPENCODE_VERSION} dans ${OPENCODE_INSTALL_DIR}…`);
    const started = Date.now();
    const install = await sh(
      `mkdir -p ${OPENCODE_INSTALL_DIR} && cd ${OPENCODE_INSTALL_DIR} && ` +
        `npm i --no-audit --no-fund opencode-ai@${OPENCODE_VERSION} 2>&1 | tail -5`,
    );
    if (install.exitCode !== 0) {
      throw new Error(`installation d'opencode échouée (exit ${install.exitCode}) : ${install.stdout}`);
    }

    /**
     * ON VÉRIFIE LE BINAIRE AVANT DE FIGER L'IMAGE. Un snapshot est copié tel
     * quel sur toutes les microVM des jours suivants : une installation à moitié
     * faite (paquet posé, binaire natif jamais téléchargé — il arrive par un
     * `postinstall`) y serait figée aussi, et chaque run irait chercher pourquoi
     * son serveur ne démarre pas. `--version` est le contrôle le moins cher qui
     * exerce vraiment le binaire.
     */
    const version = await sh(`${OPENCODE_BIN} --version 2>&1`);
    const size = await sh(`du -sm ${OPENCODE_INSTALL_DIR}/node_modules | cut -f1`);
    console.log(
      `opencode ${version.stdout} · ${size.stdout} Mo · ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
    if (version.exitCode !== 0 || !version.stdout.includes(OPENCODE_VERSION)) {
      throw new Error(
        `le binaire installé ne dit pas ${OPENCODE_VERSION} (« ${version.stdout} ») — snapshot non créé`,
      );
    }

    /**
     * `expiration: 0` = **jamais**, et ce n'est pas un détail de confort. Cet id
     * est collé dans `AGENT_SANDBOX_SNAPSHOT_ID` sur Vercel et n'est plus jamais
     * relu par personne : le jour où l'image expirerait, `getOrCreateAgentSandbox`
     * retomberait sur `runtime: node24` (le repli est écrit là-bas), les runs
     * repaieraient l'installation, et rien nulle part ne dirait pourquoi. Un
     * snapshot de base est une image de produit, pas le cache d'un run — ces
     * derniers, eux, expirent bien (`SANDBOX_SNAPSHOT_EXPIRATION_MS`).
     */
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    console.log(
      `snapshot ${(snapshot.sizeBytes / 1e9).toFixed(2)} Go · expire : ${snapshot.expiresAt?.toISOString() ?? "jamais"}`,
    );
    await verifySnapshot(snapshot.snapshotId);
    console.log(`\n✅ AGENT_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}\n`);
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

/**
 * ON REBOOTE SUR LE SNAPSHOT AVANT DE L'ANNONCER.
 *
 * Ce que ce contrôle établit, et qu'aucune lecture de doc ne dit : **`/vercel/oc`
 * survit-il à la prise d'image ?** Le dossier est hors de `/vercel/sandbox`, le
 * répertoire de travail des runs — si l'image ne portait que ce dernier, le
 * script rendrait un id parfaitement valide qui ne cuirait rien du tout, et la
 * seule trace en serait une lenteur que personne ne relie jamais à ici.
 *
 * Trente secondes de microVM pour transformer une hypothèse en fait ; l'échec
 * refuse l'id plutôt que de le publier.
 */
async function verifySnapshot(snapshotId: string): Promise<void> {
  console.log("\n⏳ contrôle : reboot sur le snapshot…");
  const fresh = await Sandbox.create({
    ...credentials(),
    source: { type: "snapshot", snapshotId },
    timeout: 300_000,
  });
  try {
    const res = await fresh.runCommand({
      cmd: "sh",
      args: ["-c", `${OPENCODE_BIN} --version 2>&1`],
    });
    const said = (await res.stdout()).trim();
    if (res.exitCode !== 0 || !said.includes(OPENCODE_VERSION)) {
      throw new Error(
        `le snapshot ne porte pas opencode ${OPENCODE_VERSION} (« ${said} », exit ${res.exitCode})`,
      );
    }
    console.log(`opencode ${said} présent au réveil ✓`);
  } finally {
    await fresh.stop().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
