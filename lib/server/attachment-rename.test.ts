import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-742 — `renameAttachment` writes the new name through the attachment
 * codec: a protected project stores it encrypted, like every other write of
 * `file_name`, and a page resource is never touched.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const RESOURCE = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({ protect: false, updates: [] as Array<Record<string, unknown>> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/attachment-content", () => ({
  shouldEncryptAttachmentMetadata: async () => h.protect,
  encodeAttachmentValue: async (_table: string, _project: string, _id: string, _column: string, value: string) =>
    `cipher:${value}`,
  decodeAttachmentRow: async (_table: string, row: Record<string, unknown>) => ({
    ...row,
    file_name: String(row.file_name).replace(/^cipher:/, ""),
  }),
}));

const { renameAttachment } = await import("./attachments");

function service() {
  return {
    from: () => {
      const update: Record<string, unknown> = {};
      const query = {
        update: (values: Record<string, unknown>) => {
          update.values = values;
          return query;
        },
        eq: (column: string, value: unknown) => {
          update[column] = value;
          return query;
        },
        neq: (column: string, value: unknown) => {
          update[`not ${column}`] = value;
          return query;
        },
        select: () => query,
        maybeSingle: async () => {
          h.updates.push(update);
          const values = update.values as { file_name: string };
          return { data: { id: RESOURCE, project_id: PROJECT, file_name: values.file_name }, error: null };
        },
      };
      return query;
    },
  } as never;
}

beforeEach(() => {
  h.protect = false;
  h.updates = [];
});

describe("renameAttachment", () => {
  it("encodes the name when attachment metadata is protected", async () => {
    h.protect = true;
    const renamed = await renameAttachment(service(), { id: RESOURCE, projectId: PROJECT, fileName: "Spec v2.pdf" });
    expect(h.updates[0]).toEqual({
      values: { file_name: "cipher:Spec v2.pdf" },
      id: RESOURCE,
      project_id: PROJECT,
      "not kind": "page",
    });
    expect(renamed?.file_name).toBe("Spec v2.pdf");
  });

  it("writes the plain name otherwise", async () => {
    await renameAttachment(service(), { id: RESOURCE, projectId: PROJECT, fileName: "notes.md" });
    expect((h.updates[0].values as { file_name: string }).file_name).toBe("notes.md");
  });
});
