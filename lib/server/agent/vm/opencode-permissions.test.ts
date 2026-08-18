import { describe, expect, it } from "vitest";

import {
  decidePermission,
  editTargets,
  KNOWN_PERMISSIONS,
  REVIEWED_OPENCODE_VERSION,
  UNKNOWN_PERMISSION_REASON,
  type PermissionAsk,
  type SubagentContext,
} from "./opencode-permissions";
import { OPENCODE_VERSION } from "./opencode-version";
import { FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { layoutForRoot } from "../harness-layout";

/**
 * MIN-286 batch 2 — the harness's verdict on an opencode permission request.
 *
 * PURE logic, therefore tested like [prune.test.ts](../prune.test.ts): we call,
 * we assert, nothing to mount. What it protects has not changed in nature — the
 * uncommitted work (`command-guard`) and the repository (`repo-path`) — only
 * the place where the question is asked has changed.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * MIN-354 — THE DEPOSIT BECAME AN ARGUMENT, AND THIS FILE CHANGED ITS MEANING
 *
 * It was written against `REPO_DIR`, therefore against `/vercel/sandbox/repo`, therefore
 * against the only world where these assertions were trivial: the tested paths
 * and the compared root came from the same constant, and could not agree.
 *
 * It is rewritten against a WORKSTATION root. This is where the
 * verdict has a job to do: `metadata.filepath` is ABSOLUTE (measure #2), and a
 * `absoluteInRepo` frozen on `/vercel` refused *every* actual write from a Mac
 * — not too much little, EVERYTHING. The last case of the "writes" block keeps
 * exactly that: the old microVM path is now **outside** of the repository,
 * and must be refused like any other.
 */

/** The root of a local run — deliberately not `/vercel` (see header). */
const LAYOUT = layoutForRoot("/Users/dev/Library/Application Support/minddy/runs/r-42", "/Users/dev/Library/Application Support/minddy/oc");
const REPO = LAYOUT.repoDir;

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({
  id: "per_1",
  sessionId: "ses_1",
  permission: "bash",
  callId: "call_1",
  ...over,
});

/** The verdict, on the filing of THIS run. */
const decide = (a: PermissionAsk, subagents?: SubagentContext) =>
  decidePermission(a, REPO, subagents);

describe("les commandes", () => {
  it("laisse passer ce qui ne détruit rien", () => {
    for (const command of ["echo hi", "npm test", "git status", "git add -A"]) {
      expect(decide(ask({ command }))).toEqual({ reply: "once" });
    }
  });

  it("refuse ce que `command-guard` refuse, en disant pourquoi au modèle", () => {
    const verdict = decide(ask({ command: "git reset --hard" }));
    expect(verdict.reply).toBe("reject");
    // The TRAVEL message: opencode copies it in the tool error, and it's there
    // let the model read it. A silent refusal would leave him guessing.
    expect(verdict.message).toContain("throws away uncommitted work");
    // And the refusal remains measurable in base, as in the time of the house loop.
    expect(verdict.reason).toBe(FORBIDDEN_COMMAND_REASON);
  });

  it("refuse une demande dont il ne sait pas lire la commande", () => {
    expect(decide(ask({ command: "  " })).reply).toBe("reject");
  });
});

describe("les écritures", () => {
  it("laisse passer un fichier du dépôt, relatif ou absolu", () => {
    expect(decide(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual({
      reply: "once",
    });
    expect(
      decide(ask({ permission: "edit", filepath: `${REPO}/lib/a.ts` })),
    ).toEqual({ reply: "once" });
  });

  it("refuse ce qui sort du dépôt — y compris en chemin ABSOLU", () => {
    // The branching trap: `resolveWithin` pastes an absolute under the repository
    // (`/etc/passwd` → `<repository>/etc/passwd`), so don't refuse anything.
    // Actual opencode returns `metadata.filepath` as an absolute path.
    expect(decide(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe(
      "reject",
    );
    expect(decide(ask({ permission: "edit", filepath: "../../etc/passwd" })).reply).toBe(
      "reject",
    );
  });

  it("refuse `.git/`, qu'opencode écrit sans rien demander", () => {
    // Measured: `write` on `<repository>/.git/config` was executed and overwrote the
    // file. This is the reason for `ask` over `edit`.
    const verdict = decide(ask({ permission: "edit", filepath: `${REPO}/.git/config` }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("refuse une demande sans chemin", () => {
    expect(decide(ask({ permission: "edit" })).reply).toBe("reject");
  });

  /**
 * THE VERDICT FOLLOWS THE RUN, AND NOTHING ELSE (MIN-354).
 *
 * `/vercel/sandbox/repo` was THE deposit; it becomes nothing more than a path like a
 * other as soon as the run lives elsewhere, and it must be refused as such. This is
 * the exact meaning of the assertion: the guard does not know any blessed path, it
 * only knows that of its run.
 */
  it("refuse l'ancien chemin de la microVM quand le run vit ailleurs", () => {
    expect(
      decide(ask({ permission: "edit", filepath: "/vercel/sandbox/repo/lib/a.ts" })).reply,
    ).toBe("reject");
  });

  /**
 * AND IT DOES NOT COME OUT OF ITS ROOT FROM THE TOP. The harness, the outputs of tools
 * and the `.tsbuildinfo` are SIBLINGS of the repository under the root of the run: a
 * `../harness/job.json` would target the job of the round — therefore the history of the
 * conversation and the push URL, including the token.
 */
  it("refuse d'écrire dans le harness du run, qui est le frère du dépôt", () => {
    expect(
      decide(ask({ permission: "edit", filepath: `${LAYOUT.harnessDir}/job.json` })).reply,
    ).toBe("reject");
    expect(decide(ask({ permission: "edit", filepath: "../harness/job.json" })).reply).toBe(
      "reject",
    );
  });
});

/**
 * `apply_patch` — ONE request for N files (measured on opencode-ai@1.18.16:
 * `ask({permission: "edit", metadata: {filepath: paths.join(", "), files}})`).
 * The pasted `filepath` is not a path: read as such, it was pass
 * `a.ts, .git` for a single directory segment, and the repository guardrail no longer saw the `.git/` which followed.
 */
describe("les écritures d'un patch multi-fichiers", () => {
  const patch = (files: { path: string; status: "added" | "modified" | "deleted" }[]) =>
    ask({
      permission: "edit",
      filepath: files.map((f) => f.path).join(", "),
      files,
    });

  it("laisse passer quand TOUS les fichiers sont dans le dépôt", () => {
    expect(
      decide(
        patch([
          { path: `${REPO}/lib/a.ts`, status: "modified" },
          { path: `${REPO}/lib/b.ts`, status: "added" },
        ]),
      ),
    ).toEqual({ reply: "once" });
  });

  it("refuse dès qu'UN fichier sort du dépôt, fût-il le dernier", () => {
    const verdict = decide(
      patch([
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: "/etc/passwd", status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
  });

  it("refuse un `.git/` caché derrière un premier fichier légitime", () => {
    const verdict = decide(
      patch([
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: `${REPO}/.git/config`, status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("ne lit JAMAIS le filepath recollé comme un chemin", () => {
    // Without `files`, this string served as the unique path.
    const joined = ask({
      permission: "edit",
      filepath: `${REPO}/lib/a.ts, ${REPO}/.git/config`,
      files: [
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: `${REPO}/.git/config`, status: "modified" },
      ],
    });
    expect(decide(joined).reply).toBe("reject");
  });
});

describe("editTargets", () => {
  it("rend la liste de `files` quand elle est là, avec la nature du geste", () => {
    expect(
      editTargets(
        ask({
          permission: "edit",
          filepath: "a.ts, b.ts",
          files: [
            { path: "a.ts", status: "added" },
            { path: "b.ts", status: "deleted" },
          ],
        }),
      ),
    ).toEqual([
      { path: "a.ts", status: "added" },
      { path: "b.ts", status: "deleted" },
    ]);
  });

  it("retombe sur le `filepath` seul des tools mono-fichier", () => {
    expect(editTargets(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual([
      { path: "lib/a.ts", status: "modified" },
    ]);
  });

  it("ne rend rien quand il n'y a rien à lire", () => {
    expect(editTargets(ask({ permission: "edit" }))).toEqual([]);
    expect(editTargets(ask({ permission: "edit", filepath: "   " }))).toEqual([]);
  });
});

/**
 * Delegation (task 12). Measured on binary on 2026-08-12: the request for
 * permission of a `task` carries `patterns: ["explore-cheap"]` and
 * `metadata: {description, subagent_type}` — **and it arrives before** opencode
 * resolves the agent. This is what makes these two refusals possible.
 */
describe("la délégation", () => {
  const context = (over: Partial<SubagentContext> = {}): SubagentContext => ({
    names: new Set(["explore", "general", "explore-anthropic-claude-haiku-4-5"]),
    running: 0,
    maxParallel: 2,
    ...over,
  });

  const task = (subagentType: string) =>
    ask({ permission: "task", subagentType });

  it("laisse déléguer sur un sous-agent offert", () => {
    expect(decide(task("explore"), context())).toEqual({ reply: "once" });
    expect(
      decide(task("explore-anthropic-claude-haiku-4-5"), context()),
    ).toEqual({ reply: "once" });
  });

  it("tient le plafond de simultané, et le DIT au modèle", () => {
    // The sandbox is shared: two girls who write at the same time
    // walk on it. Same refusal, except for the words, as the house register.
    const verdict = decide(task("general"), context({ running: 2, maxParallel: 2 }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  /**
 * MIN-286 — THE CASE THAT THE CEILING HAS TO BOUND, AND THE ONLY.
 *
 * In opencode, the foreground `task` BLOCKS the parent: the simultaneous ne
 * can only come from a round that calls `task` SEVERAL TIMES. However, these requests
 * are all arbitrated before any girl exists — the flow only attaches a
 * girl after the fact (`opencode-delegation.test.ts` anchors `runningAtAsk === 0`).
 * Counted on only the living ones, the ceiling was therefore worth zero to all three, and not
 * limited nothing. It is the credit opened by the authorizations which holds it.
 */
  it("compte les délégations AUTORISÉES dont la fille n'est pas encore née", () => {
    const verdict = decide(
      task("general"),
      context({ running: 0, pending: 2, maxParallel: 2 }),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  it("additionne les vivantes et les promises", () => {
    expect(
      decide(task("general"), context({ running: 1, pending: 1, maxParallel: 2 })).reply,
    ).toBe("reject");
    expect(
      decide(task("general"), context({ running: 1, pending: 0, maxParallel: 2 })).reply,
    ).toBe("once");
  });

  it("rend l'offre au modèle qui demande un sous-agent qui n'existe pas", () => {
    // Opencode would respond "Unknown agent type: X" without saying what is offered.
    const verdict = decide(task("general-openai-gpt-5"), context());
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("general-openai-gpt-5");
    expect(verdict.message).toContain("explore-anthropic-claude-haiku-4-5");
    expect(verdict.reason).toBe("unknown_subagent");
  });

  it("ne refuse rien quand personne ne lui a donné l'offre du tour", () => {
    // A guard who does not know what is offered should not invent one
    // refusal: the config has already decided what exists.
    expect(decide(task("explore"))).toEqual({ reply: "once" });
  });
});

describe("le reste", () => {
  it("refuse le disque hors dépôt", () => {
    expect(
      decide(ask({ permission: "external_directory", filepath: "/etc/x" })).reply,
    ).toBe("reject");
  });

  it("laisse passer ce qui n'est pas gardé (la config l'a déjà tranché)", () => {
    expect(decide(ask({ permission: "webfetch", url: "https://example.com" }))).toEqual({
      reply: "once",
    });
  });
});

/**
 * MIN-360 — WHAT THE LOCAL PATH CHANGES, AND IT ALONE.
 *
 * Three verdicts flip when the turn plays on someone's machine, and the
 * half of this block is used to guard the other half: **nothing flips in microVM**.
 * The clone is disposable, the local loop only carries our two servers, and
 * charge a round trip permission for each reading of 100% of the runs
 * cloud for a risk that does not exist would be the wrong exchange.
 */
describe("le chemin local (MIN-360)", () => {
  const local = (a: PermissionAsk) => decidePermission(a, REPO, undefined, { local: true });

  describe("les lectures", () => {
    it("refuse la famille dotenv — c'est le vrai `.env` de l'utilisateur", () => {
      for (const path of [`${REPO}/.env`, `${REPO}/.env.local`, `${REPO}/apps/web/.env`]) {
        const verdict = local(ask({ permission: "read", filepath: path }));
        expect(verdict.reply, path).toBe("reject");
        expect(verdict.reason).toBe("secret_file_read");
      }
    });

    it("renvoie vers le `.env.example`, qui reste lisible", () => {
      const verdict = local(ask({ permission: "read", filepath: `${REPO}/.env` }));
      expect(verdict.message).toMatch(/\.env\.example/);
      expect(local(ask({ permission: "read", filepath: `${REPO}/.env.example` }))).toEqual({
        reply: "once",
      });
    });

    it("laisse passer tout le reste", () => {
      for (const path of [`${REPO}/lib/x.ts`, `${REPO}/README.md`, `${REPO}/lib/env.ts`]) {
        expect(local(ask({ permission: "read", filepath: path })), path).toEqual({ reply: "once" });
      }
    });

    it("refuse une lecture dont il ne sait pas lire le chemin", () => {
      expect(local(ask({ permission: "read" })).reply).toBe("reject");
    });
  });

  /**
 * MIN-364 (decision D8) — THE FETCH IS JUDGED ON THE PORT.
 *
 * The refusal covered the entire private space, and its collateral damage was the
 * capacity we want: `curl localhost:3000` to see return the page
 * that we just wrote. What remains refused is what is NOT a page — the
 * LLM proxy (it carries the model key), the tools bridge (it does not authenticate
 * anything: joining it means calling `create_pr` in place of the agent) and the
 * opencode turn server (its API responds to who is attached).
 */
  describe("les fetchs", () => {
    const HARNESS = [4096, 4097, 51234];
    const localFetch = (url?: string) =>
      decidePermission(ask({ permission: "webfetch", url }), REPO, undefined, {
        local: true,
        harnessPorts: HARNESS,
      });

    it("refuse les trois services du harness, sur la boucle locale", () => {
      for (const url of [
        "http://127.0.0.1:4096/v1/chat/completions", // the LLM proxy, therefore the key
        "http://localhost:4097/tool", // the bridge, which authenticates nothing
        "http://[::1]:51234/session", // the opencode server of the tour
      ]) {
        const verdict = localFetch(url);
        expect(verdict.reply, url).toBe("reject");
        expect(verdict.reason).toBe("private_fetch");
      }
    });

    it("laisse passer le serveur de dév de l'utilisateur — l'écart de parité n°1", () => {
      for (const url of [
        "http://localhost:3000",
        "http://127.0.0.1:3000/api/health",
        "http://[::1]:8080/",
        "http://192.168.1.42:5173/",
      ]) {
        expect(localFetch(url), url).toEqual({ reply: "once" });
      }
    });

    it("laisse passer une URL publique", () => {
      expect(localFetch("https://example.com/docs")).toEqual({ reply: "once" });
    });

    it("refuse un fetch dont il ne sait pas lire l'URL", () => {
      expect(localFetch().reply).toBe("reject");
    });

    /**
 * WITHOUT A PORT LIST, THE ENTIRE LOCAL LOOP REMAINS DENIED — the
 * behavior from before D8. Ignorance cannot be interpreted as authorization, and the
 * supervisor is the only one to know these three ports: if he forgets to pass them, the broad refusal must remain.
 */
    it("refuse tout le privé quand les ports du harness sont inconnus", () => {
      for (const url of ["http://localhost:3000", "http://192.168.1.1/admin", "http://nas.local/x"]) {
        expect(local(ask({ permission: "webfetch", url })).reply, url).toBe("reject");
      }
    });
  });

  describe("la permission inconnue", () => {
    it("passe en microVM, refuse sur une machine", () => {
      // `lsp`, and everything that a version upgrade will add without anyone
      // read it. (`skill`, `doom_loop` and `plan_enter` have since been READ and
      // sliced, cf. `KNOWN_PERMISSIONS`: they are no longer strangers.)
      for (const permission of ["lsp", "mcp_call", "quelque_chose_de_1_19"]) {
        expect(decide(ask({ permission })), permission).toEqual({ reply: "once" });
        const verdict = local(ask({ permission }));
        expect(verdict.reply, permission).toBe("reject");
        expect(verdict.reason).toBe("unknown_permission");
        // Refusal NAMES permission: this is what makes it reparable, and this
        // which causes a version upgrade to be seen in `agent_run_events`.
        expect(verdict.message).toContain(permission);
      }
    });
  });

  /**
 * MIN-364 (D5 decision) — THE WRITE PERIMETER OPENS HERE, AND NOWHERE
 * ELSEWHERE.
 *
 * `external_directory: "deny"` has long been described as the border; he
 * was not one (a `deny` in config bypassed before publication).
 * What really refused was `absoluteInRepo` in the `case "edit"` —
 * so it was he who had to change.
 */
  describe("le périmètre d'écriture", () => {
    it("laisse écrire hors du dossier attaché — un monorepo, un dépôt voisin", () => {
      for (const path of [
        "/Users/dev/Projets/voisin/lib/x.ts",
        "/Users/dev/.config/opencode/skill/x.md",
        "../voisin/lib/x.ts",
      ]) {
        expect(local(ask({ permission: "edit", filepath: path })), path).toEqual({
          reply: "once",
        });
      }
    });

    it("publie la sortie de dossier au lieu de la refuser", () => {
      expect(local(ask({ permission: "external_directory", filepath: "/Users/dev/Projets" }))).toEqual({
        reply: "once",
      });
      // …and the microVM maintains its refusal: it only has one repository.
      expect(decide(ask({ permission: "external_directory", filepath: "/etc" })).reply).toBe(
        "reject",
      );
    });

    /**
 * THE ONLY REST OF SCOPE, and it does not depend on any decision (§9 of
 * auditing): a hook written in a `.git/` executes on the next git
 * gesture of a human, and a `.git/config` carries identifiers. Wherever it is on
 * the disk, not just in the tower repository.
 */
    it("refuse `.git/` PARTOUT, y compris dans un dépôt voisin", () => {
      for (const path of [
        `${REPO}/.git/hooks/pre-commit`,
        "/Users/dev/Projets/voisin/.git/config",
        "/Users/dev/Projets/voisin/.GIT/hooks/pre-push",
      ]) {
        const verdict = local(ask({ permission: "edit", filepath: path }));
        expect(verdict.reply, path).toBe("reject");
        expect(verdict.message).toContain(".git");
      }
    });
  });

  it("ne change RIEN aux verdicts qui existaient déjà", () => {
    expect(local(ask({ command: "npm test" }))).toEqual({ reply: "once" });
    expect(local(ask({ command: "git push" })).reply).toBe("reject");
    expect(local(ask({ permission: "edit", filepath: `${REPO}/lib/x.ts` }))).toEqual({
      reply: "once",
    });
    // …and the microVM keeps ITS boundary: it is the disposable clone, there is no
    // only a repository, and there is no reason to open the disk.
    expect(decide(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe("reject");
  });
});

/**
 * MIN-364 (batch 7, §5.5 of 08/15 audit) — THE VERSION CLICK.
 *
 * `default: reject` is the correct POSTURE on someone's machine. Left
 * alone, it makes each opencode upgrade a WITHDRAWAL of capacity that no one
 * decides: `lsp`, `plan_enter`/`plan_exit`, `skill`, `doom_loop` were all
 * refused “by construction”, and would have remained so indefinitely. Combined with
 * `OPENCODE_DISABLE_LSP_DOWNLOAD`, this meant that we would NEVER get the
 * LSP diagnostics stuck to the release — the mechanism that the delivery gate
 * itself cites as the correct form.
 *
 * What was missing was not the refusal, it was the gesture that lifted it. These tests
 * ARE this gesture: rereading becomes a step in the version upgrade.
 */
describe("les permissions lues, et la montée de version qui les périme", () => {
  it("TOMBE dès qu'opencode monte de version, tant que la liste n'a pas été relue", () => {
    expect(
      REVIEWED_OPENCODE_VERSION,
      `opencode est passé en ${OPENCODE_VERSION} et les permissions n'ont pas été relues. ` +
        "Relever le ruleset par défaut du binaire (`strings <bin> | grep doom_loop`) et les ids " +
        "de tools (`GET /experimental/tool`), caser toute permission de plus dans " +
        "`decidePermission`, l'ajouter à `KNOWN_PERMISSIONS`, PUIS avancer " +
        "`REVIEWED_OPENCODE_VERSION`.",
    ).toBe(OPENCODE_VERSION);
  });

  it("traite VRAIMENT chaque permission qu'elle déclare connaître", () => {
    // The list must not be able to grow without the `switch` growing with:
    // a name declared but not cased would fall into the `default`, i.e.
    // refused “because unknown” while being announced known.
    for (const permission of KNOWN_PERMISSIONS) {
      const verdict = decidePermission(ask({ permission }), REPO, undefined, { local: true });
      expect(verdict.reason, permission).not.toBe(UNKNOWN_PERMISSION_REASON);
    }
  });

  it("garde le refus par défaut sur ce qui n'y est PAS", () => {
    for (const permission of ["lsp", "mcp_call", "quelque_chose_de_1_19"]) {
      expect(KNOWN_PERMISSIONS.has(permission)).toBe(false);
      const verdict = decidePermission(ask({ permission }), REPO, undefined, { local: true });
      expect(verdict.reply, permission).toBe("reject");
      expect(verdict.reason).toBe(UNKNOWN_PERMISSION_REASON);
      // And he NAMES the permission: this is what makes it reparable, and what
      // causes a version upgrade to be seen in `agent_run_events`.
      expect(verdict.message).toContain(permission);
    }
  });

  /**
 * `doom_loop` is released when the model replays the exact same
 * tool call, several times in a row. Refusal is the correct verdict — no one is
 * in front of the screen to judge, and a loop costs a round each turn —
 * but he must TELL what's happening: "permission unknown" doesn't help to get out.
 */
  it("coupe une boucle en disant que c'en est une", () => {
    const verdict = decidePermission(ask({ permission: "doom_loop" }), REPO, undefined, {
      local: true,
    });
    expect(verdict.reply).toBe("reject");
    expect(verdict.reason).toBe("doom_loop");
    expect(verdict.message).toMatch(/same tool with the same input/i);
  });
});
