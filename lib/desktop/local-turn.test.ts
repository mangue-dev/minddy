import { describe, expect, it } from "vitest";

import { assertUsableLayout } from "@/lib/server/agent/harness-layout";
import {
  VM_PROTOCOL_VERSION,
  isCurrentRepoJob,
  isLocalJob,
  parseVmJob,
  type VmJob,
} from "@/lib/server/agent/vm/protocol";
import {
  assignmentToJob,
  localLayout,
  localOpencodeDir,
  localRunRoot,
  localTurnRefusalMessage,
  localTurnSecrets,
  parseLocalTurnAssignment,
  staleRunRoots,
} from "./local-turn";

/**
 * MIN-293 — THE CONTRACT BETWEEN THE SERVER AND THE MACHINE.
 *
 * The invariant that this file holds: **the server does not set any path of this
 * machine, the machine does not produce any run field.** The rest of the tests in
 * follow — a `layout` from the server is refused, a `appOrigin` from the
 * server is rewritten, and nothing else is affected.
 */

const USER_DATA = "/Users/clement/Library/Application Support/minddy";
const RUN_ID = "11111111-2222-4333-8444-555555555555";
const REPO = "/Users/clement/Projets/minddy";

/**
 * A minimal allocation. `over.job` is merged INTO the job, never
 * on top — a `...over` placed after `job:` would replace the entire job with the
 * only field that we wanted to change, and half of the refusals below would pass
 * then for the wrong one reason.
 */
function assignment(over: Record<string, unknown> = {}) {
  const { job: jobOver, ...envelope } = over;
  return {
    runId: RUN_ID,
    projectId: "proj-1",
    repoFullName: "mangue-dev/minddy",
    localWorktree: false,
    ...envelope,
    job: {
      protocolVersion: VM_PROTOCOL_VERSION,
      runId: RUN_ID,
      controlToken: "jeton.de.bail",
      appOrigin: "https://www.minddy.app",
      authUrl: "https://x-access-token:ghs_secret@github.com/mangue-dev/minddy.git",
      model: "anthropic/claude-sonnet-5",
      repoMode: "clone",
      workBranch: "minddy/run-1",
      commitRef: "MIN-293",
      ...(jobOver as object | undefined),
    },
  };
}

describe("parseLocalTurnAssignment", () => {
  it("accepts a complete assignment", () => {
    const parsed = parseLocalTurnAssignment(assignment());
    expect(parsed?.runId).toBe(RUN_ID);
    expect(parsed?.repoFullName).toBe("mangue-dev/minddy");
  });

  it("accepts a NULL repoFullName — project with no linked repository", () => {
    const parsed = parseLocalTurnAssignment(assignment({ repoFullName: null }));
    expect(parsed?.repoFullName).toBeNull();
  });

  it("still refuses a repoFullName that is neither a path nor null", () => {
    expect(parseLocalTurnAssignment(assignment({ repoFullName: 42 }))).toBeNull();
  });

  it("reads the project catalog without ever accepting a path in it", () => {
    const parsed = parseLocalTurnAssignment(
      assignment({
        projects: [
          { id: "proj-1", name: "Minddy", key: "MIN", repoFullName: "mangue-dev/minddy" },
        ],
      }),
    );
    expect(parsed?.projects).toEqual([
      { id: "proj-1", name: "Minddy", key: "MIN", repoFullName: "mangue-dev/minddy" },
    ]);
    expect(
      parseLocalTurnAssignment(
        assignment({
          projects: [{ id: "proj-1", name: "Minddy", key: "MIN", repoFullName: "/Users/x" }],
        }),
      ),
    ).toBeNull();
  });

  it("REFUSE un `layout` posé par le serveur", () => {
    // The server does not know any path to this machine. A layout from him
    // would point to a folder that no one has chosen — and `repoDir` is the root
    // security of all model writes.
    const forged = assignment();
    (forged.job as Record<string, unknown>).layout = {
      root: "/tmp/pwn",
      repoDir: "/",
      toolOutputDir: "/tmp/pwn/o",
      harnessDir: "/tmp/pwn/h",
      typecheckDir: "/tmp/pwn/t",
      opencodeDir: "/tmp/oc",
    };
    expect(parseLocalTurnAssignment(forged)).toBeNull();
  });

  it("requires a protocol version but does not JUDGE it here", () => {
    // The shell does not speak the protocol: it relays a job to a harness
    // that it downloads to the same origin, in the same gesture. It is therefore at
    // choice of harness that the two confront (`bundleDecision`), not here —
    // otherwise the app would carry a constant that it never uses and which
    // would expire with each movement of the contract.
    expect(
      parseLocalTurnAssignment(assignment({ job: { protocolVersion: VM_PROTOCOL_VERSION + 1 } }))
        ?.job.protocolVersion,
    ).toBe(VM_PROTOCOL_VERSION + 1);
    for (const protocolVersion of [undefined, "2", 2.5, null]) {
      expect(parseLocalTurnAssignment(assignment({ job: { protocolVersion } }))).toBeNull();
    }
  });

  it("rejects a job without a lease: it could not even return its report", () => {
    expect(parseLocalTurnAssignment(assignment({ job: { controlToken: "" } }))).toBeNull();
    expect(parseLocalTurnAssignment(assignment({ job: { controlToken: undefined } }))).toBeNull();
  });

  it("refuse un job dont l'identité de run ne correspond pas à l'enveloppe", () => {
    // Two truths about the same fact: the one that decides the file (the envelope)
    // and the one who decides what the lease opens (the job). They must be
    // the same, otherwise a run would write in the root of another run.
    expect(parseLocalTurnAssignment(assignment({ job: { runId: "un-autre" } }))).toBeNull();
  });

  it("rejects an incomplete envelope, a string, or an HTML page", () => {
    expect(parseLocalTurnAssignment(assignment({ repoFullName: "  " }))).toBeNull();
    expect(parseLocalTurnAssignment(assignment({ projectId: 42 }))).toBeNull();
    expect(parseLocalTurnAssignment({ runId: RUN_ID })).toBeNull();
    expect(parseLocalTurnAssignment("<!doctype html>")).toBeNull();
    expect(parseLocalTurnAssignment(null)).toBeNull();
  });

  it("tolerates a server from before the option but rejects an inconsistent value", () => {
    expect(parseLocalTurnAssignment(assignment({ localWorktree: undefined }))?.localWorktree).toBe(false);
    expect(parseLocalTurnAssignment(assignment({ localWorktree: "yes" }))).toBeNull();
  });
});

describe("le layout de la machine", () => {
  it("gives each run a root — two tickets share neither a job nor a SQLite database", () => {
    const a = localRunRoot(USER_DATA, RUN_ID);
    const b = localRunRoot(USER_DATA, "99999999-2222-4333-8444-555555555555");
    expect(a).not.toBe(b);
    expect(a.startsWith(`${USER_DATA}/agent-runs/`)).toBe(true);
  });

  it("passe l'identifiant au tamis : aucune racine ne sort du dossier de travail", () => {
    // The identifier comes from the base, but it crosses the network before arriving
    // here: a `/` or a `..` would take the root out of its folder, and that's
    // it which limits the harness, its tool outputs and its `.tsbuildinfo`.
    const base = `${USER_DATA}/agent-runs`;
    for (const hostile of ["../../../etc", "a/b", "..", "./.ssh", ""]) {
      const root = localRunRoot(USER_DATA, hostile);
      expect(root.startsWith(`${base}/`)).toBe(true);
      expect(root.slice(base.length + 1)).not.toContain("/");
      expect(root.slice(base.length + 1).startsWith(".")).toBe(false);
    }
  });

  it("installe opencode HORS de la racine du run — 144 Mo par ticket, sinon", () => {
    const dir = localOpencodeDir(USER_DATA);
    expect(dir).toBe(`${USER_DATA}/opencode`);
    expect(dir.startsWith(`${USER_DATA}/agent-runs/`)).toBe(false);
  });

  it("produit un layout que les garde-fous savent tenir", () => {
    const layout = localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO });
    expect(() => assertUsableLayout(layout)).not.toThrow();
    // The rule that counts: the harness and its outputs are NEVER in the
    // repository, otherwise they appear in the user's `git status` and
    // within the perimeter of the tour.
    expect(layout.repoDir).toBe(REPO);
    expect(layout.harnessDir.startsWith(`${REPO}/`)).toBe(false);
    expect(layout.toolOutputDir.startsWith(`${REPO}/`)).toBe(false);
    expect(layout.typecheckDir.startsWith(`${REPO}/`)).toBe(false);
  });

  it("survives a `userData` path with a trailing slash", () => {
    expect(localRunRoot(`${USER_DATA}/`, RUN_ID)).toBe(localRunRoot(USER_DATA, RUN_ID));
  });
});

describe("assignmentToJob", () => {
  const layout = localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO });
  const job = assignmentToJob(parseLocalTurnAssignment(assignment())!, {
    layout,
    appOrigin: "http://localhost:3000",
  });

  it("REWRITES the origin: the machine talks only to whoever gave it its work", () => {
    // The server resolves `agentControlOrigin()`, which falls back on production
    // excluding Vercel. A dev shell would then talk to www.minddy.app with a
    // lease signed by localhost.
    expect(job.appOrigin).toBe("http://localhost:3000");
  });

  it("sets current-repository mode as a VALUE, never by inference", () => {
    expect(job.repoMode).toBe("current");
    expect(isCurrentRepoJob(job)).toBe(true);
  });

  it("sets clone mode for an isolated worktree", () => {
    const isolated = assignmentToJob(parseLocalTurnAssignment(assignment({ localWorktree: true }))!, {
      layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO, isolated: true }),
      appOrigin: "http://localhost:3000",
      isolated: true,
    });
    expect(isolated.repoMode).toBe("clone");
    expect(isCurrentRepoJob(isolated)).toBe(false);
    expect(isolated.layout.repoDir).toBe(`${USER_DATA}/agent-runs/${RUN_ID}/repo`);
  });

  it("charges no startup — there was no microVM", () => {
    expect(job.bootstrapMs).toBe(0);
  });

  it("reste un job LOCAL au sens du harness", () => {
    expect(isLocalJob(job)).toBe(true);
  });

  it("touches nothing else — the run belongs to the server", () => {
    expect(job.model).toBe("anthropic/claude-sonnet-5");
    expect(job.workBranch).toBe("minddy/run-1");
    expect(job.controlToken).toBe("jeton.de.bail");
  });

  it("pose le layout de la machine, et lui seul", () => {
    expect(job.layout).toEqual(layout);
  });

  it("includes local paths only after the machine has validated them", () => {
    const withProjects = assignmentToJob(parseLocalTurnAssignment(assignment())!, {
      layout,
      appOrigin: "http://localhost:3000",
      localProjects: [
        {
          id: "proj-2",
          name: "Autre projet",
          key: "AUT",
          repoFullName: "mangue-dev/autre",
          localPath: "/Users/clement/Projets/autre",
        },
      ],
    });
    expect(withProjects.localProjects).toEqual([
      expect.objectContaining({ localPath: "/Users/clement/Projets/autre" }),
    ]);
    expect(job.localProjects).toBeUndefined();
  });
});

describe("localTurnSecrets", () => {
  it("porte le bail et l'URL de push — les deux choses que le journal ne doit pas garder", () => {
    const job = assignmentToJob(parseLocalTurnAssignment(assignment())!, {
      layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
      appOrigin: "https://www.minddy.app",
    });
    const secrets = localTurnSecrets(job);
    expect(secrets).toContain("jeton.de.bail");
    expect(secrets.some((s) => s.includes("ghs_secret"))).toBe(true);
  });

  it("ne rend jamais de valeur vide — elles substitueraient tout le journal", () => {
    const job = assignmentToJob(
      parseLocalTurnAssignment(assignment({ job: { authUrl: "" } }))!,
      {
        layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
        appOrigin: "https://www.minddy.app",
      },
    );
    expect(localTurnSecrets(job)).toEqual(["jeton.de.bail"]);
  });
});

/**
 * THE ONLY PLACE WHERE THE TWO GRAPHS MEET.
 *
 * `lib/desktop/local-turn.ts` cannot import `VmJob`: `vm/protocol.ts`
 * type-imports `../runs`, which is `server-only`, and following it would bring the
 * half of the server into the shell's type-check — measured, it then hits
 * on about forty files that have nothing to do with it.
 *
 * This test runs under the tsconfig ROOT, where the two graphs coexist without
 * trouble. It therefore redeems the verification that we had to remove from the module: what the
 * machine writes in `job.json` is indeed a `VmJob`, and the harness which will read it
 * will not make a mistake. Without it, the shell could derive from the contract without
 * no compiler saying so.
 */
describe("what the machine writes IS a contract job", () => {
  const built = assignmentToJob(parseLocalTurnAssignment(fullAssignment())!, {
    layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
    appOrigin: "https://www.minddy.app",
  });

  it("passe la porte du HARNESS — `parseVmJob`, et pas une relecture à nous", () => {
    // The only authority that counts: it is this function that the harness calls
    // on the `job.json` that we just wrote.
    expect(() => parseVmJob(built)).not.toThrow();
    expect(built.protocolVersion).toBe(VM_PROTOCOL_VERSION);
  });

  it("pose les quatre champs de la machine AU TYPE DU CONTRAT", () => {
    // ⚠ The annotation IS the test: `tsc` refuses these lines on the day when one of the
    // four changes type or meaning in `protocol.ts`. This is what replaces
    // import `VmJob` that the shell cannot do — and that works
    // exactly what the shell writes, no more, no less.
    const machineFields: Pick<
      VmJob,
      "layout" | "appOrigin" | "repoMode" | "bootstrapMs"
    > = {
      layout: built.layout,
      appOrigin: built.appOrigin,
      repoMode: built.repoMode,
      bootstrapMs: built.bootstrapMs,
    };
    expect(machineFields.repoMode).toBe("current");
  });

  it("loses NO server fields along the way", () => {
    // The sharing invariant, checked at runtime: the machine adds four
    // fields and don't touch anything else. A poorly placed `...spread` would
    //disappear the opencode log or subagent settings by
    // silence, and the tour would start again with amnesia.
    const server = fullAssignment().job;
    const posesParLaMachine = new Set(["layout", "appOrigin", "repoMode", "bootstrapMs"]);
    for (const [key, value] of Object.entries(server)) {
      if (posesParLaMachine.has(key)) continue;
      expect(built[key]).toEqual(value);
    }
  });
});

/** A COMPLETE job — the one that the server actually delivers, with all fields populated. */
function fullAssignment() {
  const job: Omit<VmJob, "layout" | "bootstrapMs"> = {
    protocolVersion: VM_PROTOCOL_VERSION,
    runId: RUN_ID,
    ledgerRunId: RUN_ID,
    projectId: "proj-1",
    appOrigin: "https://www.minddy.app",
    controlToken: "jeton.de.bail",
    model: "anthropic/claude-sonnet-5",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder-key",
    reasoningLevel: "medium",
    contextWindow: 200_000,
    inputUsdPerMTok: 3,
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: true,
    webSearch: false,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    opencodeInput: { prompt: "vas-y", anchorInstructions: "# ancrage" },
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/run-1",
    repoMode: "clone",
    committer: { name: "minddy agent", email: "agent@minddy.app" },
    authUrl: "https://x-access-token:ghs_secret@github.com/mangue-dev/minddy.git",
    commitRef: "MIN-293",
    filesFromSha: "deadbeef",
    locale: "fr",
    feature: "agent_code",
  };
  return {
    runId: RUN_ID,
    projectId: "proj-1",
    repoFullName: "mangue-dev/minddy",
    localWorktree: false,
    job,
  };
}

describe("staleRunRoots", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  it("supprime ce qui n'a pas bougé depuis une semaine", () => {
    expect(
      staleRunRoots(
        [
          { name: "vieux", modifiedMs: now - 8 * DAY },
          { name: "recent", modifiedMs: now - 2 * DAY },
        ],
        { nowMs: now },
      ),
    ).toEqual(["vieux"]);
  });

  it("NEVER touches the root of a running run", () => {
    // The household also turns at the end of a round, and a second round can be in progress
    // theft: taking away his job and his SQLite database would kill him without a word.
    expect(
      staleRunRoots([{ name: "en-vol", modifiedMs: now - 30 * DAY }], {
        nowMs: now,
        live: new Set(["en-vol"]),
      }),
    ).toEqual([]);
  });

  it("deletes nothing for an unreadable date", () => {
    expect(
      staleRunRoots([{ name: "?", modifiedMs: Number.NaN }], { nowMs: now }),
    ).toEqual([]);
  });

  it("uses a shorter delay when given one", () => {
    expect(
      staleRunRoots([{ name: "hier", modifiedMs: now - 2 * DAY }], { nowMs: now, keepDays: 1 }),
    ).toEqual(["hier"]);
  });
});

describe("ce que l'utilisateur lit quand rien n'a démarré", () => {
  it("names the repair action, not only the failure", () => {
    expect(localTurnRefusalMessage("no_repo", "mangue-dev/minddy")).toContain("mangue-dev/minddy");
    expect(localTurnRefusalMessage("no_repo", "x/y")).toMatch(/attach/i);
    expect(localTurnRefusalMessage("repo_invalid", "x/y")).toMatch(/moved|unmounted/i);
    expect(localTurnRefusalMessage("assignment_invalid", "x/y")).toMatch(/update/i);
  });

  it("reads without a repository identity (local-only project)", () => {
    expect(localTurnRefusalMessage("no_repo", null)).toMatch(/attach/i);
    expect(localTurnRefusalMessage("repo_invalid", null)).toMatch(/moved|unmounted/i);
  });
});
