import { describe, expect, it } from "vitest";

import { commitAndPush } from "./repo-host";
// Le fake reste une SANDBOX et passe par `sandboxHost` : depuis MIN-224 ce test
// couvre donc aussi l'adaptateur RPC, c'est-à-dire le chemin réel de l'ancienne
// forme — la logique de `commitAndPush`, elle, est désormais commune aux deux.
import { sandboxHost, type Sandbox } from "./sandbox";
import { cloudLayout } from "./harness-layout";

/**
 * Fin de tour côté git (MIN-123) : QUAND le harnais touche-t-il au dépôt ?
 *
 * `git push HEAD:refs/heads/<branche>` CRÉE la branche distante, même quand l'arbre
 * est propre — donc une session qui n'a rien changé (question, plan, vérification)
 * laissait une branche vide sur le dépôt de l'utilisateur. Ce qui se teste ici est
 * cette décision, et elle seule : la branche n'atteint le remote qu'à partir du
 * premier commit, et en cas de doute on pousse (ne jamais garder du travail hors
 * du remote). Les mains dans le vrai git sont couvertes par la microVM.
 */

/** Une commande shell vue par la sandbox factice, et ce qu'elle doit répondre. */
interface Reply {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

const BASE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORK_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/**
 * Sandbox factice : route chaque commande vers la première clé qui la préfixe et
 * enregistre tout ce qui a été lancé. Une commande non prévue est un échec du test
 * (une commande git inattendue ne doit pas passer inaperçue), sauf `git status`
 * et `git rev-parse` dont les défauts décrivent le cas nominal « rien changé ».
 */
function fakeSandbox(routes: Record<string, Reply | ((call: number) => Reply)>): {
  sandbox: Sandbox;
  commands: string[];
} {
  const commands: string[] = [];
  const counts = new Map<string, number>();
  const sandbox = {
    runCommand: async ({ args }: { args: string[] }) => {
      const command = args[1] ?? "";
      commands.push(command);
      const key = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((prefix) => command.startsWith(prefix));
      if (!key) throw new Error(`unexpected command: ${command}`);
      const seen = (counts.get(key) ?? 0) + 1;
      counts.set(key, seen);
      const route = routes[key];
      const reply = typeof route === "function" ? route(seen) : route;
      return {
        exitCode: reply.exitCode ?? 0,
        stdout: async () => reply.stdout ?? "",
        stderr: async () => reply.stderr ?? "",
      };
    },
  } as unknown as Sandbox;
  return { sandbox, commands };
}

const OPTS = {
  authUrl: "https://x-access-token:tok@github.com/acme/app.git",
  workBranch: "minddy/agent/min-123-abcd1234",
  baseBranch: "main",
  message: "wip(MIN-123): agent update",
};

describe("commitAndPush", () => {
  it("ne pousse RIEN quand le tour n'a rien changé (aucune branche créée)", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${BASE_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res).toEqual({
      committed: false,
      remoteUpdated: false,
      headSha: BASE_SHA,
      pushed: false,
    });
    // Ni push, ni même un ls-remote : le dépôt n'est pas touché du tout.
    expect(commands.some((c) => c.startsWith("git push"))).toBe(false);
    expect(commands.some((c) => c.startsWith("git ls-remote"))).toBe(false);
  });

  it("commite puis pousse dès qu'un fichier a changé", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: " M lib/foo.ts\n" },
      "git add -A": {},
      "git commit -m": {},
      // Le commit fait avancer HEAD : c'est LUI qui rend la branche poussable.
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: "" },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res).toEqual({
      committed: true,
      remoteUpdated: true,
      headSha: WORK_SHA,
      pushed: true,
    });
    expect(commands).toContain(`git add -A`);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("pousse une branche héritée même sur un tour purement conversationnel", async () => {
    // Session qui reprend une branche déjà poussée : HEAD est en avance sur la base,
    // le remote est déjà à jour → push no-op, mais la branche existe et le reste.
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: `${WORK_SHA}\trefs/heads/${OPTS.workBranch}\n` },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res.pushed).toBe(true);
    expect(res.committed).toBe(false);
    // Le remote n'a pas AVANCÉ : pas de réouverture de PR refusée sur ce tour.
    expect(res.remoteUpdated).toBe(false);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("pousse quand le sha de la base est illisible (défaut sûr)", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${BASE_SHA}\n` },
      "git rev-parse --verify": { exitCode: 128, stderr: "fatal: Needed a single revision" },
      "git ls-remote": { stdout: "" },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res.pushed).toBe(true);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("remonte l'échec d'un push (le tour doit le signaler)", async () => {
    const { sandbox } = fakeSandbox({
      "git status --porcelain": { stdout: " M lib/foo.ts\n" },
      "git add -A": {},
      "git commit -m": {},
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: "" },
      "git push": { exitCode: 1, stderr: "! [rejected] non-fast-forward" },
    });

    await expect(commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS)).rejects.toThrow(/non-fast-forward/);
  });
});
