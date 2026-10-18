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
  row: null as null | Row,
  claimed: false,
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
      data: { id: "issue-1", project_id: "project-1", description: h.description }, error: null,
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
      if (h.claimed) return false;
      h.claimed = true;
      return true;
    },
    releaseDocumentMaterialization: async () => {
      h.claimed = false;
    },
    staleDocumentStreams: async () => [],
  };
});

const authority = await import("./description-collaboration");
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
  h.access = { canWrite: true };
  h.beforeCommit = null;
  h.updateIssueFields.mockReset().mockImplementation(async ({ input }) => {
    h.description = input.description ?? "";
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

  it("leaves a description another instance is materializing", async () => {
    h.row!.revision += 1;
    h.claimed = true;
    expect(await authority.materializeDescription(
      { kind: "issue", id: "issue-1", projectId: "project-1" }, "user-1")).toBe("busy");
    expect(h.updateIssueFields).not.toHaveBeenCalled();
  });
});
