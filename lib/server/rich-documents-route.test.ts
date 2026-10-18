// The editor documents of descriptions (MIN-728) through their routes: the
// Markdown every external reader sees is derived on the server from the
// submitted document, and the document is stored only after the parent's own
// write authorized it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  getAuthedUser: vi.fn(),
  updateIssueFields: vi.fn(),
  updateObjective: vi.fn(),
  setScratchpad: vi.fn(),
  upsert: vi.fn(),
  parentVersion: 0,
  sealed: [] as unknown[],
}));

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: h.getAuthedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/update-issue", () => ({
  MAX_DESCRIPTION_LENGTH: 65_536,
  updateIssueFields: h.updateIssueFields,
}));
vi.mock("@/lib/server/objectives", () => ({
  MAX_OBJECTIVE_DESCRIPTION_LENGTH: 65_536,
  updateObjective: h.updateObjective,
}));
vi.mock("@/lib/server/encryption/content-config", () => ({ isContentEncryptionEnabled: () => false }));
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => ({}) }));
vi.mock("@/lib/server/encryption/row-codec", () => ({
  EncryptedRowCodec: class {
    async encode(row: Record<string, unknown>, context: unknown) {
      h.sealed.push(context);
      return { ...row, content: null, encrypted_content: { sealed: true }, encryption_version: 3 };
    }
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => table === "rich_documents"
      ? { upsert: h.upsert }
      : {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { encryption_version: h.parentVersion }, error: null }) }),
          }),
        },
  }),
}));

vi.mock("@/lib/server/scratchpad", () => ({ getScratchpad: vi.fn(), setScratchpad: h.setScratchpad }));

const issueRoute = await import("@/app/api/issues/[id]/route");
const notebookRoute = await import("@/app/api/me/scratchpad/route");
const objectiveRoute = await import("@/app/api/objectives/[id]/route");

const ISSUE = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

const doc = (...blocks: unknown[]) => ({ type: "doc", content: blocks });
const paragraph = (text: string, id = "b1") => ({
  type: "paragraph",
  attrs: { blockId: id },
  content: [{ type: "text", text }],
});
const patch = (url: string, body: unknown) =>
  new NextRequest(url, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  h.parentVersion = 0;
  h.sealed = [];
  h.getAuthedUser.mockReset().mockResolvedValue({ ok: true, user: { id: "user-1" } });
  h.updateIssueFields.mockReset().mockImplementation(async ({ input }) => ({
    ok: true,
    issue: { id: ISSUE, project_id: PROJECT, description: input.description },
  }));
  h.updateObjective.mockReset().mockImplementation(async ({ input }) => ({
    ok: true,
    objective: { id: ISSUE, project_id: PROJECT, description: input.description },
  }));
  h.upsert.mockReset().mockResolvedValue({ error: null });
});

describe("description documents (MIN-728)", () => {
  it("derives the issue description from the document and stores both", async () => {
    const content = doc(
      { type: "heading", attrs: { level: 2, blockId: "h" }, content: [{ type: "text", text: "Steps" }] },
      paragraph("Ignore this", "p")
    );
    const response = await issueRoute.PATCH(
      patch(`http://localhost/api/issues/${ISSUE}`, {
        description: "a client projection is never trusted",
        description_doc: content,
      }),
      { params: Promise.resolve({ id: ISSUE }) }
    );

    expect(response.status).toBe(200);
    const { input } = h.updateIssueFields.mock.calls[0][0];
    expect(input.description).toBe("## Steps\n\nIgnore this");
    expect(input).not.toHaveProperty("description_doc");
    // The writer hands the document to the live authority (MIN-728).
    expect(h.updateIssueFields.mock.calls[0][0].descriptionDocument).toMatchObject({ type: "doc" });
  });

  it("refuses a page-tree block before writing anything", async () => {
    const response = await issueRoute.PATCH(
      patch(`http://localhost/api/issues/${ISSUE}`, {
        description_doc: doc({ type: "subpage", attrs: { pageId: PROJECT, blockId: "s" } }),
      }),
      { params: Promise.resolve({ id: ISSUE }) }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "documentRefused" });
    expect(h.updateIssueFields).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("refuses a document whose Markdown would be truncated", async () => {
    const response = await issueRoute.PATCH(
      patch(`http://localhost/api/issues/${ISSUE}`, {
        description_doc: doc(paragraph("x".repeat(70_000))),
      }),
      { params: Promise.resolve({ id: ISSUE }) }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "documentTooLarge" });
    expect(h.updateIssueFields).not.toHaveBeenCalled();
  });

  it("stores no document when the parent write is refused", async () => {
    h.updateIssueFields.mockResolvedValueOnce({ ok: false, status: 403, errorKey: "readOnlyProject" });
    const response = await issueRoute.PATCH(
      patch(`http://localhost/api/issues/${ISSUE}`, { description_doc: doc(paragraph("Hi")) }),
      { params: Promise.resolve({ id: ISSUE }) }
    );
    expect(response.status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("leaves a Markdown-only write to the Markdown", async () => {
    await issueRoute.PATCH(
      patch(`http://localhost/api/issues/${ISSUE}`, { description: "Plain **text**" }),
      { params: Promise.resolve({ id: ISSUE }) }
    );
    expect(h.updateIssueFields.mock.calls[0][0].input).toEqual({ description: "Plain **text**" });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("hands an objective's document to the writer with the derived Markdown", async () => {
    await expect(objectiveRoute.PATCH(
      patch(`http://localhost/api/objectives/${ISSUE}`, { description_doc: doc(paragraph("Goal")) }),
      { params: Promise.resolve({ id: ISSUE }) }
    )).resolves.toHaveProperty("status", 200);
    const call = h.updateObjective.mock.calls[0][0];
    expect(call.input.description).toBe("Goal");
    expect(call.descriptionDocument).toMatchObject({ type: "doc" });
  });

  it("never keeps a clear notebook document next to an encrypted notebook", async () => {
    h.parentVersion = 3;
    h.setScratchpad.mockResolvedValueOnce({ content: "Note", rev: 5, conflicted: false });
    await notebookRoute.PUT(new NextRequest("http://localhost/api/me/scratchpad", {
      method: "PUT",
      body: JSON.stringify({ content: "Note", rev: 4, content_doc: doc(paragraph("Note")) }),
      headers: { "content-type": "application/json" },
    }));
    expect(h.sealed).toEqual([{ table: "rich_documents", scope: { kind: "user", id: "user-1" } }]);
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ kind: "notebook", content: null, encryption_version: 3 });
  });

  it("keeps a notebook document only for a clean write of the same Markdown", async () => {
    const put = (content: string, document: unknown) =>
      new NextRequest("http://localhost/api/me/scratchpad", {
        method: "PUT",
        body: JSON.stringify({ content, rev: 4, content_doc: document }),
        headers: { "content-type": "application/json" },
      });
    const note = doc({
      type: "taskList",
      attrs: { blockId: "l" },
      content: [{ type: "taskItem", attrs: { state: "todo", blockId: "t" },
        content: [paragraph("Ship it", "p")] }],
    });

    h.setScratchpad.mockResolvedValueOnce({ content: "- [ ] Ship it", rev: 5, conflicted: false });
    await notebookRoute.PUT(put("- [ ] Ship it", note));
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ id: "user-1", kind: "notebook", user_id: "user-1", project_id: null });

    // A conflict answers with the server's version: the document is not it.
    h.setScratchpad.mockResolvedValueOnce({ content: "- [ ] Other", rev: 6, conflicted: true });
    await notebookRoute.PUT(put("- [ ] Ship it", note));
    // A document that says something else than the stored Markdown is dropped.
    h.setScratchpad.mockResolvedValueOnce({ content: "- [x] Ship it", rev: 6, conflicted: false });
    await notebookRoute.PUT(put("- [x] Ship it", note));
    expect(h.upsert).toHaveBeenCalledOnce();
  });
});
