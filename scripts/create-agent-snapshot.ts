/**
 * Crée un snapshot Vercel Sandbox pré-provisionné pour l'agent de code (MIN-46),
 * afin d'obtenir un démarrage quasi instantané des runs (sans lui, chaque run
 * réinstalle ses outils au boot). OPTIONNEL — l'agent fonctionne sans.
 *
 * Usage (auth via VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID en env) :
 *   npx tsx scripts/create-agent-snapshot.ts
 *
 * Copie ensuite l'id affiché dans AGENT_SANDBOX_SNAPSHOT_ID (Vercel + .env.local).
 */
import { Sandbox } from "@vercel/sandbox";

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
    runtime: "node24",
    timeout: 300_000,
  });

  try {
    // Vérifie l'outillage de base (git + node sont fournis par le runtime node24).
    const git = await sandbox.runCommand("git", ["--version"]);
    const node = await sandbox.runCommand("node", ["--version"]);
    console.log(`git: ${(await git.stdout()).trim()} · node: ${(await node.stdout()).trim()}`);

    // Emplacement d'accueil du dépôt (créé une fois pour éviter un mkDir au boot).
    await sandbox.runCommand("mkdir", ["-p", "/vercel/sandbox/repo"]);

    const snapshot = await sandbox.snapshot();
    console.log(`\n✅ AGENT_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}\n`);
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
