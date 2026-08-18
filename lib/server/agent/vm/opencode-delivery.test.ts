import { beforeEach, describe, expect, it, vi } from "vitest";

// All four controls are mocked: this file does not test what they SAY
// (each has their own test, unchanged), they test what the opencode world gives them
// to read — an authorized writing, a completed order, a written plan — and by
// where their answer returns to the model.
vi.mock("../diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
  testFailuresForTurn: vi.fn(async () => ({ block: "TESTS", scope: "full" as const })),
}));
vi.mock("../self-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../self-review")>()),
  formatSelfReview: vi.fn(() => "DIFF"),
}));
vi.mock("../plan-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plan-review")>()),
  planReviewForTurn: vi.fn(async () => "PLAN_REVIEW"),
}));
vi.mock("../plan-closure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plan-closure")>()),
  planClosureForTurn: vi.fn(async () => "PLAN_CLOSURE"),
}));
vi.mock("../repo-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../repo-host")>()),
  // The SIZE of the round chooses the scope of the test run (MIN-262). A big one
  // default turn: this is the case that pays for the entire suite.
  turnDiffStat: vi.fn(async () => ({ files: ["a.ts", "b.ts", "c.ts", "d.ts"], lines: 400, untracked: 0 })),
}));

import { makeOpencodeDelivery, repoRelative } from "./opencode-delivery";
import { typeErrorsForTurn, testFailuresForTurn } from "../diagnostics";
import { turnDiffStat, type RepoHost } from "../repo-host";
import { cloudLayout, layoutForRoot } from "../harness-layout";

/** The repository of the tested run — the one that the inert host below declares. */
const REPO_DIR = cloudLayout().repoDir;

/**
 * MIN-286 batch 2, task 14 — DELIVERY RULES, IN THE OPENCODE WORLD.
 *
 * What is checked has not changed: `delivery-gate`, `self-review`,
 * `plan-closure` and `diagnostics` are the same functions, with their
 * tests unchanged. This file tests the WIRING, that is to say the three places where the
 * turn could have broken it silently:
 *
 * 1. the edition no longer comes from one of our tools but from a **request for
 * permission** (ABSOLUTE path) ;
 * 2. the “the model tested itself” no longer comes from the exit code of
 * `run_command` but from the **`metadata.exit` of the opencode `bash`** ;
 * 3. the voice of the harness no longer sends a message `user` but in **`followUp`**,
 * the bridge sticks to the result text of tool.
 */

/** Host inert: controls are mocked, nothing needs to run. */
function fakeHost(): RepoHost {
  return {
    layout: cloudLayout(),
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

/**
 * A repository that RESPONDS: `git diff --name-only` (including deletions) and
 * `git status --porcelain` (new files). This is where the survey will look for
 * what no writing tool has announced.
 */
function repoSaying(diffNames: string, porcelain: string): RepoHost {
  return {
    ...fakeHost(),
    exec: async (command: string) => ({
      exitCode: 0,
      stdout: command.includes("status --porcelain") ? porcelain : diffNames,
      stderr: "",
    }),
  } as RepoHost;
}

/** Large budget: no control is prevented by the remaining time. */
const ROOMY = 12 * 60 * 60_000;

function deliveryFor(over: Partial<Parameters<typeof makeOpencodeDelivery>[0]> = {}) {
  const phases: string[] = [];
  const delivery = makeOpencodeDelivery({
    host: fakeHost(),
    emit: async (_type, payload) => {
      if (typeof payload.phase === "string") phases.push(payload.phase);
    },
    filesFromSha: "abc123",
    remainingMs: () => ROOMY,
    ...over,
  });
  return { delivery, phases };
}

/** The bridge hatch: he says what he is told, without checking anything. */
function forwarder(success = true) {
  return async () => ({ result: { ok: success }, success });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("l'édition, lue sur la demande de permission", () => {
  it("note le chemin RELATIF d'une écriture autorisée, et le sert au type-check", async () => {
    // `metadata.filepath` is absolute at opencode; type-check and mode
    // target of the runner speak in repository paths. The conversion is here, a
    // only once — doing it elsewhere would cause it to miss somewhere.
    const { delivery } = deliveryFor();
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);

    expect(delivery.checkpointEditedPaths()).toEqual(["lib/x.ts"]);

    const checks = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(checks.followUp).toContain("TYPES");
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/x.ts"]);
    // The type-check empties its work queue, but the checkpoint keeps the
    // attribution log: the diff of a shared checkout should never be
    // rebuild from the global `git status`.
    expect(delivery.checkpointEditedPaths()).toEqual(["lib/x.ts"]);
  });

  it("ignore un chemin hors du dépôt plutôt que de le mettre en tête des erreurs", () => {
    const { delivery } = deliveryFor();
    delivery.noteEdit("/etc/passwd");
    expect(delivery.checkpointEditedPaths()).toEqual([]);
  });

  it("latche `repoTouched` pour le tour SUIVANT, même sans pull request", () => {
    // A turn that does not open a PR never crosses the door: without this lock
    // at the checkpoint, the restarted turn appears to be blank and the code leaves without control.
    const { delivery } = deliveryFor();
    expect(delivery.repoTouched()).toBe(false);
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);
    delivery.noteEdits();
    expect(delivery.repoTouched()).toBe(true);
  });

  it("repart des chemins que le checkpoint portait", async () => {
    const { delivery } = deliveryFor({ editedPaths: ["lib/hier.ts"], repoTouched: true });
    delivery.noteEdit(`${REPO_DIR}/lib/aujourdhui.ts`);
    expect(delivery.checkpointEditedPaths()).toEqual(["lib/hier.ts", "lib/aujourdhui.ts"]);
  });
});

describe("ce que le modèle a vérifié lui-même (MIN-262)", () => {
  it("se tait sur les tests quand une commande de test est sortie en 0", async () => {
    const { delivery, phases } = deliveryFor({ repoTouched: true });
    delivery.noteShell("npx vitest run", 0);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    // The door still speaks (types, diff) but has not restarted ANYTHING: 80 s of wall
    // saved to learn what the turn just read.
    expect(vi.mocked(testFailuresForTurn)).not.toHaveBeenCalled();
    expect(out.followUp).not.toContain("TESTS");
    expect(phases).toContain("tests");
  });

  it("relance quand la commande est sortie ROUGE", async () => {
    const { delivery } = deliveryFor({ repoTouched: true });
    delivery.noteShell("npx vitest run", 1);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(out.followUp).toContain("TESTS");
  });

  it("relance quand une édition a suivi le vert — vert AVANT la dernière édition ne vaut rien", async () => {
    const { delivery } = deliveryFor();
    delivery.noteShell("npm test", 0);
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(out.followUp).toContain("TESTS");
  });
});

describe("la porte de `create_pr`", () => {
  it("rend les contrôles au premier appel sans pousser, puis livre au second", async () => {
    const opened: string[] = [];
    const { delivery } = deliveryFor();
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);
    const createPr = delivery.wrapCreatePr(async (args) => {
      opened.push(String(args.title));
      return { result: { url: "https://pr/1" }, success: true };
    });

    const first = await createPr({ title: "Mon titre" });
    expect(opened).toEqual([]);
    expect(first.success).toBe(true);
    expect(first.followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");

    const second = await createPr({ title: "Mon titre" });
    expect(opened).toEqual(["Mon titre"]);
    expect(second.followUp).toBeUndefined();
  });

  it("laisse passer du premier coup un tour qui n'a rien touché", async () => {
    // Nothing edited AND own work tree: it is the conjunction which defines
    // “did not touch anything” since the shell counts (see the following case).
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 0, untracked: 0 });
    const { delivery } = deliveryFor();
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    const out = await createPr({});
    expect(out.result).toEqual({ url: "u" });
    expect(out.followUp).toBeUndefined();
  });

  /**
 * MIN-286 — THE TURN THAT WAS NOT EDITED BY ANY TOOL.
 *
 * Delete and rename are COMMANDS at opencode, plus tools: un
 * `rm`, un `mv`, un `sed -i` do not go through any permission request `edit`,
 * so `editedPaths` remains empty and the door remained silent — no type-check,
 * no tests, no rereading of the diff, on a turn which has indeed changed
 * the deposit. It's the work tree that decides.
 */
  it("réclame quand même ses contrôles quand le dépôt a bougé par le SHELL", async () => {
    const { delivery } = deliveryFor();
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    const out = await createPr({});
    expect(out.followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    // The files still there enter the targeted type-check: this is what a
    // codemod just rewrote.
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
  });

  it("compte une SUPPRESSION seule, et la donne au type-check", async () => {
    /**
 * MIN-286 — `turnDiffStat` excludes deletions of `files`
 * (`--diff-filter=d`): its list is the one passed to `vitest related`, where
 * a disappeared path has no meaning. The type-check needs it — it's
 * even the change that breaks the ELSEWHERE typing, and the door shuts up on
 * an empty list. The home loop noted the path (`delete_file` →
 * `noteEdited`); it now comes from git.
 */
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 42, untracked: 0 });
    const { delivery } = deliveryFor({ host: repoSaying("lib/y.ts\n", "") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    expect((await createPr({})).followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/y.ts"]);
  });

  it("compte un fichier NEUF créé au shell, que git ne suit pas encore", async () => {
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 0, untracked: 1 });
    const { delivery } = deliveryFor({ host: repoSaying("", "?? lib/neuf.ts\n") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/neuf.ts"]);
  });

  /**
 * MIN-358 — THE PERIMETER, when the deposit is not ours. Without it, the poll
 * reads the ENTIRE working tree: the user's WIP would make a purely conversational round
 * say that he touched the repository, and would make him pay for a
 * type-check and a suite of tests on files he has never heard of
 * talk about.
 */
  /**
 * MIN-358 — THE EDITIONS OF THIS TOUR, distinct from the checkpoint accumulation. The
 * distinction was of no use as long as the deposit was ours; it decides to
 * while in current repository mode, where the work from PREVIOUS rounds is still
 * "modified" in the tree (our commits live on a ref, not on the HEAD of
 * the user) — and would therefore be mistaken for its own.
 */
  it("sépare les éditions de CE tour de celles qu'il a héritées", () => {
    const { delivery } = deliveryFor({ editedPaths: ["hier.ts"] });
    delivery.noteEdit(`${REPO_DIR}/aujourdhui.ts`);

    expect(delivery.turnEditedPaths()).toEqual(["aujourdhui.ts"]);
    expect(delivery.checkpointEditedPaths()).toEqual(["hier.ts", "aujourdhui.ts"]);
  });

  it("borne les lectures de diff au périmètre du tour en mode dépôt courant", async () => {
    const { delivery } = deliveryFor({
      host: repoSaying("", ""),
      scopePaths: async () => ["lib/a.ts"],
    });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(turnDiffStat).mock.calls[0][2]).toEqual(["lib/a.ts"]);
  });

  it("ne borne RIEN en mode clone — l'arbre n'y contient que le travail de l'agent", async () => {
    const { delivery } = deliveryFor({ host: repoSaying("", "") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(turnDiffStat).mock.calls[0][2]).toBeUndefined();
  });

  it("PÉRIME ce que le modèle avait vérifié avant de toucher au dépôt par le shell", async () => {
    /**
 * MIN-286 — `noteVerificationStale` was only called from `noteEdit`,
 * i.e. from `edit` permission. A green `npm test` launched BEFORE a
 * `rm`/`sed -i` therefore silenced the door on tests which no longer spoke
 * of the deposit being delivered. The home loop also expired, since its removal tools.
 */
    const { delivery } = deliveryFor({ host: repoSaying("lib/y.ts\n", "") });
    delivery.noteShell("npx vitest run", 0);
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    expect((await createPr({})).followUp).toContain("TESTS");
    expect(vi.mocked(testFailuresForTurn)).toHaveBeenCalled();
  });
});

describe("le contrôle du plan, accroché au geste", () => {
  it("rend la relecture et la clôture en followUp de `write_issue_plan`", async () => {
    const { delivery, phases } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder());

    const out = await tool("write_issue_plan", { identifier: "MIN-1", plan: "- [ ] Faire `lib/x.ts`" });

    expect(out.followUp).toBe("PLAN_REVIEW\n\n---\n\nPLAN_CLOSURE");
    expect(phases).toEqual(["plan_check"]);
  });

  it("ne parle qu'une fois, et jamais sur un autre tool", async () => {
    const { delivery } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder());

    expect((await tool("read_issue", { identifier: "MIN-1" })).followUp).toBeUndefined();
    expect((await tool("write_issue_plan", { plan: "- [ ] x" })).followUp).toContain("PLAN_REVIEW");
    expect((await tool("write_issue_plan", { plan: "- [ ] y" })).followUp).toBeUndefined();
  });

  it("ne contrôle rien quand l'écriture a ÉCHOUÉ — il n'y a pas de plan à relire", async () => {
    const { delivery } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder(false));

    expect((await tool("write_issue_plan", { plan: "- [ ] x" })).followUp).toBeUndefined();
  });
});

/**
 * `repoRelative` TAKES ITS DEPOSIT AS AN ARGUMENT (MIN-354), and this is what makes
 * sense outside of microVM: `metadata.filepath` of opencode is ABSOLUTE, therefore compared
 * to `/vercel/sandbox/repo` on a machine where the repository lives elsewhere, it rendered
 * `""` on EVERY release — so no more files in the targeted type-check of
 * the delivery gate, nor in the `related` mode of the test runner, and a
 * gate that lets everything pass without checking anything.
 *
 * Replayed on two roots for the same reason as `repo-path.test.ts`: what
 * is checked is a property, not a prefix.
 */
describe.each([
  ["microVM", cloudLayout()],
  ["poste de travail", layoutForRoot("/Users/dev/minddy/runs/r-3", "/Users/dev/oc")],
])("repoRelative (%s)", (_name, layout) => {
  const repo = layout.repoDir;

  it("rend le chemin du dépôt, laisse un relatif tel quel, refuse le dehors", () => {
    expect(repoRelative(repo, `${repo}/lib/x.ts`)).toBe("lib/x.ts");
    expect(repoRelative(repo, "lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative(repo, "./lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative(repo, repo)).toBe("");
    expect(repoRelative(repo, "/etc/passwd")).toBe("");
    expect(repoRelative(repo, "  ")).toBe("");
  });

  it("ne prend pas le dépôt d'un AUTRE run pour le sien", () => {
    // Two runs on a machine are two sibling folders: the neighbor's is
    // “the outside”, exactly like `/etc`.
    const other = layoutForRoot("/Users/dev/minddy/runs/r-4", "/Users/dev/oc").repoDir;
    expect(repoRelative(repo, `${other}/lib/x.ts`)).toBe("");
  });
});
