import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  installOpencode,
  probeConfig,
  probeRoot,
  sleep,
  startProbeServer,
  startProvider,
  waitFor,
  type FakeProvider,
  type ProbeServer,
} from "./opencode-probe-rig";

/**
 * MIN-364 (lot 9, §3 #11-#12 and §5.4 of the audit of 08/15) — THE THREE CAPACITIES
 * “TO BE FRAMED”, MEASURED BEFORE BEING DECISIONED.
 *
 * Does NOT work with `npm test`: `describe.skipIf` skips it until
 * `MDY_OPENCODE_CAPS_PROBE=1` is placed. No templates are spent.
 *
 * MDY_OPENCODE_CAPS_PROBE=1 MDY_OPENCODE_BIN=<…>/bin/opencode \
 * npx vitest run lib/server/agent/vm/opencode-capabilities.probe.test.ts --testTimeout=900000
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * WHY IT EXISTS
 *
 * The audit ranks `skill`, `todowrite` and the MCP servers of the repository in "at
 * frame", and the framing could not be done without knowing **where these things come from
 * come**. A `skill: true` placed without knowing it opens — on the user's
 * machine — a door whose audit does not measure the width.
 *
 * ⚠ THE DISCOVERY IS MEMORIZED on first access: any measurement of a
 * `OPENCODE_DISABLE_*` requests a NEW server, with the variable set from
 * `spawn` (`startProbeServer({env})`). A first version of this probe
 * restored `process.env` before restarting, and therefore measured a server on
 * on which nothing was installed - it said "yes, it is well cut" on three cases
 * where nothing was.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * STATEMENT OF 2026-08-15 on `opencode-ai@1.18.16`
 *
 * 1. **`skill` reads `$HOME`, not `XDG_CONFIG_HOME`.** The discovery is
 * `~/.claude/skills/…/SKILL.md` and `~/.agents/skills/…/SKILL.md`, plus the same
 * raised from the session folder to the repository root. The harness
 * relocates `XDG_*` but **not `HOME`**: `skill: true` on a Mac would serve
 * therefore to the agent the Claude Code skills of its owner AND those of the
 * deposit, without anything having it decided.
 * 2. **Two hatches exist to choose from**, and the harness posed neither:
 * `OPENCODE_DISABLE_EXTERNAL_SKILLS` (cuts ALL implicit discovery) and
 * `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` (cuts `~/.claude` only). Plus a
 * config key `skills.paths` that NAMEs the folders — the only selective form
 *, and the only one that survives `OPENCODE_DISABLE_EXTERNAL_SKILLS`.
 * 3. **`todowrite` is purely local to opencode**: no permissions published,
 * no writing elsewhere. Its cost is a larger set of tools and a second checklist next to ours — not the network.
 * 4. **The MCP servers in the repository are closed by
 * `OPENCODE_DISABLE_PROJECT_CONFIG`**, and the `mcp` key from OUR config rest
 * read: serving an MCP server named by minddy is possible without reopening the
 * upload which also picks up the `*.ts` tools and plugins.
 */

const LIVE = process.env.MDY_OPENCODE_CAPS_PROBE === "1";

let installRoot = "";
let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  installRoot = probeRoot("install-caps");
  roots.push(installRoot);
  bin = installOpencode(installRoot);
}, 600_000);

afterEach(() => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
});

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A setting where the SETTING IS SET BEFORE THE SERVER: `prepare` receives the root and
 * the repository, writes whatever it wants, and only then does opencode start. It is this
 * that the memorization of the discovery imposes.
 */
async function boot(opts: {
  tag: string;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
  prepare?: (paths: { root: string; repo: string }) => void;
}): Promise<{ server: ProbeServer; provider: FakeProvider }> {
  const provider = await startProvider([{ text: "fini" }]);
  providers.push(provider);
  const root = probeRoot(opts.tag);
  roots.push(root);
  const { execFileSync } = await import("node:child_process");
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=probe", ...args], { cwd: repo });
  git(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "init"]);
  opts.prepare?.({ root, repo });

  const server = await startProbeServer({
    bin,
    tag: opts.tag,
    config: probeConfig(provider.url, opts.config ?? {}),
    reuse: { root, repo },
    ...(opts.env ? { env: opts.env } : {}),
  });
  running.push(server);
  return { server, provider };
}

/** Sets a skill in the expected format (`<dir>/<nom>/SKILL.md`, YAML front-matter). */
function writeSkill(dir: string, name: string, description: string): void {
  const target = path.join(dir, name);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nFais ce qui est écrit ici.\n`,
  );
}

/** The skills that opencode says it knows, by their name (`GET /skill`). */
async function skillNames(server: ProbeServer): Promise<string[]> {
  const res = await server.get("/skill").catch(() => null);
  const body = res?.body;
  const list = Array.isArray(body) ? body : ((body as { skills?: unknown[] })?.skills ?? []);
  return (list as Array<{ name?: string }>)
    .map((s) => String(s?.name ?? ""))
    .filter(Boolean)
    .sort();
}

describe.skipIf(!LIVE)("d'où viennent les skills (§3 #11)", () => {
  const poser = ({ root }: { root: string }): void => {
    // `startProbeServer` places `HOME` on the root of the probe: we therefore write there
    // “the user’s home”, without ever touching the real thing.
    writeSkill(path.join(root, ".claude", "skills"), "skill-de-lhumain", "la sienne");
    writeSkill(path.join(root, ".agents", "skills"), "skill-agents", "la sienne aussi");
  };

  it(
    "les prend dans `$HOME`, que le harness ne relocalise PAS",
    async () => {
      const { server } = await boot({
        tag: "skill-home",
        config: { tools: { skill: true } },
        prepare: poser,
      });
      const names = await skillNames(server);
      // THIS IS THE FACT THAT FRAMES LOT 9: opening `skill` on a Mac is
      // open the Claude Code skills folder of its owner.
      expect(names).toEqual(expect.arrayContaining(["skill-de-lhumain", "skill-agents"]));
    },
    900_000,
  );

  it(
    "`OPENCODE_DISABLE_EXTERNAL_SKILLS` les coupe TOUTES",
    async () => {
      const { server } = await boot({
        tag: "skill-coupe",
        config: { tools: { skill: true } },
        env: { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" },
        prepare: poser,
      });
      const names = await skillNames(server);
      expect(names).not.toContain("skill-de-lhumain");
      expect(names).not.toContain("skill-agents");
    },
    900_000,
  );

  it(
    "`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` ne coupe QUE `~/.claude`",
    async () => {
      const { server } = await boot({
        tag: "skill-claude",
        config: { tools: { skill: true } },
        env: { OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1" },
        prepare: poser,
      });
      const names = await skillNames(server);
      expect(names).not.toContain("skill-de-lhumain");
      expect(names).toContain("skill-agents");
    },
    900_000,
  );

  it(
    "`skills.paths` NOMME les dossiers — la seule forme sélective",
    async () => {
      let choisi = "";
      const { server } = await boot({
        tag: "skill-paths",
        config: {}, // completed just after: the path depends on the root
        prepare: ({ root }) => {
          choisi = path.join(root, "skills-minddy");
          writeSkill(choisi, "skill-nommee", "celle que minddy a choisie");
        },
      });
      server.stop();
      // The path only exists after `prepare`: we restart with the config that contains it
      // name, on the SAME setting.
      const repris = await startProbeServer({
        bin,
        tag: "skill-paths",
        config: probeConfig(providers.at(-1)!.url, {
          tools: { skill: true },
          skills: { paths: [choisi] },
        }),
        reuse: { root: server.root, repo: server.repo },
        // And with the implicit discovery CUT: it is the combination which
        // interests the framing — nothing from the user's disk, only this
        // que minddy nomme.
        env: { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" },
      });
      running.push(repris);

      const names = await skillNames(repris);
      expect(names).toContain("skill-nommee");
      expect(names).not.toContain("skill-de-lhumain");
    },
    900_000,
  );
});

describe.skipIf(!LIVE)("ce que `todowrite` coûte vraiment (§3 #12)", () => {
  it(
    "n'écrit nulle part hors d'opencode — le coût est le jeu de tools, pas le réseau",
    async () => {
      const { server, provider } = await boot({
        tag: "todo",
        config: { tools: { todowrite: true } },
      });
      provider.queue.length = 0;
      provider.queue.push({
        tools: [
          {
            name: "todowrite",
            args: {
              todos: [
                { id: "1", content: "explorer", status: "in_progress", priority: "high" },
                { id: "2", content: "écrire", status: "pending", priority: "medium" },
              ],
            },
          },
        ],
      });
      const session = await server.createSession("todo");
      await server.prompt(session);
      await waitFor(() => server.toolParts().some((p) => p.tool === "todowrite"), 30_000);
      await sleep(300);

      const part = server.toolParts().find((p) => p.tool === "todowrite");
      expect(part?.status, `le tool n'a pas abouti : ${part?.error ?? "?"}`).toBe("completed");
      // No published permission: nothing to arbitrate, therefore nothing that comes out of
      // process. The “20 network writes” of §3 #12 targets `update_plan`, our
      // checklist to us — not this one.
      expect(server.asks().map((a) => a.permission)).not.toContain("todowrite");
    },
    900_000,
  );
});

describe.skipIf(!LIVE)("les serveurs MCP (§5.4, dernière écoutille)", () => {
  /** A repository `opencode.json` that declares an MCP server — whatever
 * any public repository can carry, and that a session starts at startup. */
  const piegerLeDepot = ({ repo }: { repo: string }): void => {
    fs.writeFileSync(
      path.join(repo, "opencode.json"),
      JSON.stringify({ mcp: { piege: { type: "local", command: ["/bin/echo", "coucou"] } } }),
    );
  };

  it(
    "ceux du DÉPÔT sont bien fermés par `OPENCODE_DISABLE_PROJECT_CONFIG`",
    async () => {
      const { server } = await boot({
        tag: "mcp-depot",
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
        prepare: piegerLeDepot,
      });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      expect(
        Object.keys(mcp),
        "le `opencode.json` du dépôt est remonté : la fermeture ne tient plus",
      ).toEqual([]);
    },
    900_000,
  );

  it(
    "…et le TÉMOIN : sans l'écoutille, le dépôt impose bien son serveur",
    async () => {
      // Without this witness, the test above would also pass on the day when the `mcp` key
      // would cease to exist — it would then measure the absence of a functionality,
      // not the effect of a hatch.
      const { server } = await boot({ tag: "mcp-temoin", prepare: piegerLeDepot });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      expect(Object.keys(mcp)).toEqual(["piege"]);
    },
    900_000,
  );

  it(
    "la clé `mcp` de NOTRE config est lue : nommer reste possible",
    async () => {
      const { server } = await boot({
        tag: "mcp-notre",
        config: {
          mcp: { minddy: { type: "local", command: ["/bin/echo", "coucou"], enabled: false } },
        },
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
        prepare: piegerLeDepot,
      });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      // Ours passes, that of the deposit does not: the closure is SELECTIVE, which
      // is exactly what Lot 9 scoping needed to know.
      expect(Object.keys(mcp)).toEqual(["minddy"]);
    },
    900_000,
  );
});
