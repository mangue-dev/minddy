// The authority of live descriptions (MIN-728), against an in-memory store
// that behaves like `commit_rich_document`: steps are really applied and
// projected through the `.pages-md` bundle, only the database is replaced.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

vi.mock("server-only", () => ({}));

type Row = {
  revision: number;
  materializedRevision: number;
  materializedHash: string | null;
  content: JSONContent;
  batches: Array<{ base: number; stepCount: number; clientId: string; authorId: string | null; steps: unknown[]; batchId: string }>;
};

const h = vi.hoisted(() => ({
  description: "",
  plan: "",
  parentMissing: false,
  row: null as null | Row,
  claimed: false,
  deferred: 0,
  updateIssueFields: vi.fn(),
  access: { canWrite: true } as { canWrite: boolean } | null,
  /** Called before each commit, to simulate typing landing first. */
  beforeCommit: null as null | (() => void),
}));

const fingerprint = (id: string, markdown: string) => `fp:${id}:${markdown.trim()}`;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: () => {} }));
vi.mock("@/lib/server/project-access", () => ({ hasProjectAccess: async () => h.access }));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => ({
    select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({
      data: h.parentMissing
        ? null
        : { id: "issue-1", project_id: "project-1", description: h.description, plan: h.plan },
      error: null,
    }) }) }) }),
  }),
}));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => ({}) }));
vi.mock("@/lib/server/update-issue", () => ({ updateIssueFields: h.updateIssueFields }));
vi.mock("@/lib/server/rich-documents", async () => {
  const actual = await vi.importActual<typeof import("./rich-documents")>("./rich-documents");
  const head = () => h.row && {
    revision: h.row.revision,
    materializedRevision: h.row.materializedRevision,
    materializedHash: h.row.materializedHash,
    content: h.row.content,
    encryptionVersion: 0,
    projectId: "project-1",
  };
  return {
    usesPageOnlyNodes: actual.usesPageOnlyNodes,
    documentIdOf: actual.documentIdOf,
    markdownFingerprint: fingerprint,
    readDocumentHead: async () => head(),
    createDocumentStream: async (_owner: unknown, content: JSONContent, hash: string) => {
      h.row ??= { revision: 0, materializedRevision: 0, materializedHash: hash, content, batches: [] };
    },
    documentBatchReceipt: async (_id: string, batchId: string) => {
      const batch = h.row?.batches.find((item) => item.batchId === batchId);
      return batch ? batch.base + batch.stepCount : null;
    },
    commitDocument: async (_owner: unknown, _head: unknown, content: JSONContent,
      batch: { base: number; batchId: string; clientId: string; steps: unknown[]; authorId: string | null },
      materializedHash: string | null) => {
      h.beforeCommit?.();
      h.beforeCommit = null;
      const row = h.row!;
      if (row.revision !== batch.base) return { status: "behind", head: row.revision };
      row.revision += batch.steps.length;
      row.content = content;
      row.batches.push({ ...batch, stepCount: batch.steps.length });
      if (materializedHash) {
        row.materializedRevision = row.revision;
        row.materializedHash = materializedHash;
      }
      return { status: "accepted", revision: row.revision };
    },
    readDocumentBatches: async (_owner: unknown, since: number) =>
      (h.row?.batches ?? []).filter((batch) => batch.base + batch.stepCount > since),
    markDocumentMaterialized: async (_id: string, revision: number, hash: string) => {
      h.row!.materializedRevision = Math.max(h.row!.materializedRevision, revision);
      h.row!.materializedHash = hash;
    },
    claimDocumentMaterialization: async () => {
      if (h.claimed) return null;
      h.claimed = true;
      return "claim-token";
    },
    deferDocumentMaterialization: async () => {
      h.deferred += 1;
    },
    releaseDocumentMaterialization: async () => {
      h.claimed = false;
    },
    staleDocumentStreams: async () => [],
  };
});

const authority = await import("./description-collaboration");
const { documentIdOf } = await vi.importActual<typeof import("./rich-documents")>("./rich-documents");
const { pageCollaborationServer, descriptionMarkdownServer } = await import("./pages-projection");

const paragraph = (text: string, blockId: string): JSONContent => ({
  type: "paragraph", attrs: { blockId }, content: [{ type: "text", text }],
});
const doc = (...blocks: JSONContent[]): JSONContent => ({ type: "doc", content: blocks });

/** Steps that turn `from` into `to`, as a browser session would send them. */
const stepsBetween = (from: JSONContent, to: JSONContent) =>
  pageCollaborationServer().diffCollabSteps("body", from, to);

const submission = (base: number, steps: unknown[], extra: Record<string, unknown> = {}) => ({
  field: "body" as const, base, batchId: crypto.randomUUID(), clientId: "browser-session-1",
  steps, presentation: false, ...extra,
});

async function markdownOf(content: JSONContent) {
  return (await descriptionMarkdownServer()).toMarkdown(content);
}

beforeEach(() => {
  h.description = "Context\n\nSteps";
  h.row = {
    revision: 3,
    materializedRevision: 3,
    materializedHash: fingerprint("issue-1", "Context\n\nSteps"),
    content: doc(paragraph("Context", "a"), paragraph("Steps", "b")),
    batches: [],
  };
  h.claimed = false;
  h.deferred = 0;
  h.access = { canWrite: true };
  h.beforeCommit = null;
  h.plan = "";
  h.parentMissing = false;
  h.updateIssueFields.mockReset().mockImplementation(async ({ input }) => {
    if ("plan" in input) h.plan = input.plan ?? "";
    else h.description = input.description ?? "";
    return { ok: true, issue: {} };
  });
});

describe("live description batches", () => {
  it("accepts typing on the head and leaves the Markdown to the materialization", async () => {
    const typed = doc(paragraph("Context, typed live", "a"), paragraph("Steps", "b"));
    const answer = await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-1");

    expect(answer).toMatchObject({ ok: true, result: { status: "accepted" } });
    expect(await markdownOf(h.row!.content)).toBe("Context, typed live\n\nSteps");
    expect(h.row!.materializedRevision).toBe(3);
    expect(h.row!.batches[0].authorId).toBe("user-1");
  });

  it("asks a session based on an older revision to catch up", async () => {
    const answer = await authority.submitDescriptionBatch("issue", "issue-1",
      submission(1, stepsBetween(h.row!.content, doc(paragraph("x", "a")))), "user-1");
    expect(answer).toMatchObject({ ok: true, result: { status: "behind", head: 3 } });
  });

  it("acknowledges a retried batch instead of applying it twice", async () => {
    const typed = doc(paragraph("Context!", "a"), paragraph("Steps", "b"));
    const batch = submission(3, stepsBetween(h.row!.content, typed));
    await authority.submitDescriptionBatch("issue", "issue-1", batch, "user-1");
    const again = await authority.submitDescriptionBatch("issue", "issue-1", batch, "user-1");
    expect(again).toMatchObject({ ok: true, result: { status: "accepted", revision: h.row!.revision } });
    expect(h.row!.batches).toHaveLength(1);
  });

  it("refuses a page-tree block and a reader's batch", async () => {
    const withSubpage = doc(paragraph("Context", "a"),
      { type: "subpage", attrs: { pageId: "11111111-1111-4111-8111-111111111111", blockId: "s" } });
    const steps = pageCollaborationServer().diffCollabSteps("body", h.row!.content, withSubpage);
    expect(await authority.submitDescriptionBatch("issue", "issue-1", submission(3, steps), "user-1"))
      .toMatchObject({ ok: true, result: { status: "refused", reason: "content-refused" } });

    h.access = { canWrite: false };
    expect(await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, doc(paragraph("x", "a")))), "user-1"))
      .toEqual({ ok: false, status: 403 });
  });

  it("refuses a presentation batch that changes the text", async () => {
    const answer = await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, doc(paragraph("Other", "a"), paragraph("Steps", "b"))),
        { presentation: true }), "user-1");
    expect(answer).toMatchObject({ ok: true, result: { status: "refused", reason: "presentation-changed" } });
  });

  it("converges two sessions typing in the same description", async () => {
    const base = h.row!.content;
    const first = doc(paragraph("Context from A", "a"), paragraph("Steps", "b"));
    const second = doc(paragraph("Context", "a"), paragraph("Steps from B", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1", submission(3, stepsBetween(base, first)), "user-a");
    // B wrote against revision 3 too: told to catch up, it rebases its steps
    // onto A's, as its stream does, and sends again.
    const late = await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(base, second)), "user-b");
    expect(late).toMatchObject({ ok: true, result: { status: "behind" } });
    const catchUp = await authority.readDescriptionSteps("issue", "issue-1", 3, "user-b");
    if (!catchUp.ok || catchUp.catchUp.kind !== "steps") throw new Error("expected steps");
    const rebased = pageCollaborationServer().rebaseCollabSteps("body", base,
      stepsBetween(base, second), catchUp.catchUp.steps);
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(catchUp.catchUp.to, rebased), "user-b");
    expect(await markdownOf(h.row!.content)).toBe("Context from A\n\nSteps from B");
  });
});

describe("writers outside a session", () => {
  it("sends an agent's Markdown to live editors as steps, keeping untouched blocks", async () => {
    await authority.syncDescriptionWrite({
      kind: "issue", id: "issue-1", projectId: "project-1",
      markdown: "Context\n\nSteps, rewritten by Numo", authorId: "user-1",
    });
    expect(await markdownOf(h.row!.content)).toBe("Context\n\nSteps, rewritten by Numo");
    expect(h.row!.content.content![0].attrs?.blockId).toBe("a");
    expect(h.row!.content.content![1].attrs?.blockId).toBe("b");
    expect(h.row!.materializedRevision).toBe(h.row!.revision);
  });

  it("keeps typing that lands while the agent's write is committed", async () => {
    // A person types in the first block just before the agent's commit.
    h.beforeCommit = () => {
      const typed = doc(paragraph("Context, being typed", "a"), paragraph("Steps", "b"));
      const steps = stepsBetween(h.row!.content, typed);
      h.row!.content = typed;
      h.row!.batches.push({ base: h.row!.revision, stepCount: steps.length, clientId: "browser",
        authorId: "user-2", steps, batchId: crypto.randomUUID() });
      h.row!.revision += steps.length;
    };
    await authority.syncDescriptionWrite({
      kind: "issue", id: "issue-1", projectId: "project-1",
      markdown: "Context\n\nSteps, rewritten by Numo", authorId: "user-1",
    });
    expect(await markdownOf(h.row!.content)).toBe("Context, being typed\n\nSteps, rewritten by Numo");
  });

  it("folds a Markdown written outside the authority on the next read, only when nothing is pending", async () => {
    h.description = "Context\n\nSteps from GitHub";
    const snapshot = await authority.readDescriptionSnapshot("issue", "issue-1", "user-1");
    expect(snapshot.ok && await markdownOf(snapshot.snapshot.doc)).toBe("Context\n\nSteps from GitHub");

    // Pending typing: the read does not fold; the materialization will.
    h.row!.revision += 1;
    h.description = "Something else";
    await authority.readDescriptionSnapshot("issue", "issue-1", "user-1");
    expect(await markdownOf(h.row!.content)).toBe("Context\n\nSteps from GitHub");
  });
});

describe("materialization", () => {
  it("writes the head's Markdown through the issue writer, signed by its author", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps, typed", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-1");
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, null)).toBe("materialized");
    expect(h.updateIssueFields).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "issue-1", actorId: "user-1",
      input: { description: "Context\n\nSteps, typed" }, descriptionFromDocument: true,
    }));
    expect(h.row!.materializedRevision).toBe(h.row!.revision);
    expect(h.claimed).toBe(false);
  });

  it("signs with the last author even when a presentation batch came after", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps, typed by A", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-a");
    // A reader's editor rebuilds pills: same text, no author.
    const head = h.row!;
    h.row!.batches.push({ base: head.revision, stepCount: 1, clientId: "reader", authorId: null,
      steps: [], batchId: crypto.randomUUID() });
    head.revision += 1;
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, null)).toBe("materialized");
    expect(h.updateIssueFields).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-a" }));
    expect(h.description).toBe("Context\n\nSteps, typed by A");
  });

  it("keeps pending typing when a forge write lands before the materialization", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps, typed live", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-1");
    // The forge rewrites the other block meanwhile, outside the authority.
    h.description = "Context from GitHub\n\nSteps";
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, null)).toBe("materialized");
    expect(h.description).toBe("Context from GitHub\n\nSteps, typed live");
    expect(await markdownOf(h.row!.content)).toBe("Context from GitHub\n\nSteps, typed live");
  });

  it("lets typing win on a block the forge also rewrote", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps, typed live", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-1");
    h.description = "Context\n\nSteps from GitHub";
    await authority.materializeDescription({ kind: "issue", id: "issue-1", projectId: "project-1" }, null);
    expect(h.description).toBe("Context\n\nSteps, typed live");
  });

  it("keeps all typing when the journal no longer holds every pending step", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps, typed live", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-1");
    h.row!.batches = []; // trimmed, or cleared when the document was sealed
    h.description = "Context from GitHub\n\nSteps from GitHub";
    await authority.materializeDescription({ kind: "issue", id: "issue-1", projectId: "project-1" }, "user-1");
    expect(h.description).toBe("Context\n\nSteps, typed live");
  });

  it("signs with an earlier author when the last one may no longer write", async () => {
    const first = doc(paragraph("Context by A", "a"), paragraph("Steps", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, first)), "user-a");
    const second = doc(paragraph("Context by A", "a"), paragraph("Steps by B", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(h.row!.revision, stepsBetween(h.row!.content, second)), "user-b");
    h.updateIssueFields.mockImplementation(async ({ actorId, input }) => {
      if (actorId === "user-b") return { ok: false, status: 403 };
      h.description = input.description ?? "";
      return { ok: true, issue: {} };
    });
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, null)).toBe("materialized");
    expect(h.description).toBe("Context by A\n\nSteps by B");
  });

  it("drops typing no author may write any more", async () => {
    const typed = doc(paragraph("Context", "a"), paragraph("Steps by a removed member", "b"));
    await authority.submitDescriptionBatch("issue", "issue-1",
      submission(3, stepsBetween(h.row!.content, typed)), "user-gone");
    h.updateIssueFields.mockResolvedValue({ ok: false, status: 403 });
    await authority.materializeDescription({ kind: "issue", id: "issue-1", projectId: "project-1" }, null);
    expect(await markdownOf(h.row!.content)).toBe("Context\n\nSteps");
    expect(h.deferred).toBe(0);
  });

  it("sends a description whose issue is gone to the back of the queue", async () => {
    h.row!.revision += 1;
    h.parentMissing = true;
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, null)).toBe("missing");
    expect(h.deferred).toBe(1);
    expect(h.claimed).toBe(false);
  });

  it("leaves a description another instance is materializing", async () => {
    h.row!.revision += 1;
    h.claimed = true;
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, "user-1")).toBe("busy");
    expect(h.updateIssueFields).not.toHaveBeenCalled();
  });
});

describe("live plans", () => {
  const plan = "## Steps\n\n- [ ] Write the migration\n- [ ] Ship it";

  beforeEach(async () => {
    h.plan = plan;
    const content = (await descriptionMarkdownServer()).fromMarkdown(plan);
    h.row = {
      revision: 0, materializedRevision: 0,
      materializedHash: fingerprint(documentIdOf({ kind: "plan", id: "issue-1" }), plan),
      content: pageCollaborationServer().canonicalBodyJSON(content) as JSONContent, batches: [],
    };
  });

  it("keeps the plan's document apart from the description's", () => {
    const id = documentIdOf({ kind: "plan", id: "11111111-1111-4111-8111-111111111111" });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(documentIdOf({ kind: "plan", id: "11111111-1111-4111-8111-111111111111" })).toBe(id);
    expect(documentIdOf({ kind: "issue", id: "issue-1" })).toBe("issue-1");
  });

  it("writes typed plans back to issues.plan, never to the description", async () => {
    const markdown = await descriptionMarkdownServer();
    const typed = markdown.reconcile(h.row!.content,
      markdown.fromMarkdown(`${plan}\n- [ ] Announce it`));
    await authority.submitDescriptionBatch("plan", "issue-1",
      submission(0, stepsBetween(h.row!.content, typed!)), "user-1");
    expect(await authority.materializeDescription(
      { kind: "plan", id: "issue-1", projectId: "project-1" }, null)).toBe("materialized");
    expect(h.updateIssueFields).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "issue-1", actorId: "user-1",
      input: { plan: `${plan}\n- [ ] Announce it` }, planFromDocument: true,
    }));
    expect(h.description).toBe("Context\n\nSteps");
  });

  it("keeps typing when an agent ticks a task meanwhile", async () => {
    const markdown = await descriptionMarkdownServer();
    const typing = markdown.reconcile(h.row!.content,
      markdown.fromMarkdown("## Steps, being renamed\n\n- [ ] Write the migration\n- [ ] Ship it"))!;
    h.beforeCommit = () => {
      // A person's batch lands while the agent's write is computed.
      const steps = stepsBetween(h.row!.content, typing);
      const applied = pageCollaborationServer().applyCollabSteps("body", h.row!.content, steps);
      if (!applied.ok) throw new Error("typing did not apply");
      h.row!.batches.push({ base: h.row!.revision, stepCount: steps.length, clientId: "browser",
        authorId: "user-2", steps, batchId: crypto.randomUUID() });
      h.row!.revision += steps.length;
      h.row!.content = applied.doc as JSONContent;
    };
    await authority.syncDescriptionWrite({ kind: "plan", id: "issue-1", projectId: "project-1",
      markdown: "## Steps\n\n- [x] Write the migration\n- [ ] Ship it", authorId: "agent" });
    expect(await markdownOf(h.row!.content))
      .toBe("## Steps, being renamed\n\n- [x] Write the migration\n- [ ] Ship it");
  });
});
