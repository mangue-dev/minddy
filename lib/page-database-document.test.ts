import { describe, expect, it } from "vitest";
import {
  pageDatabaseDocument,
  type DatabaseDocumentPage,
} from "./page-database-document";

const database: DatabaseDocumentPage = {
  id: "db",
  parent_id: null,
  title: "Journal",
  database_schema: [
    { id: "owner", name: "Owner", type: "people" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "notes", name: "Notes", type: "text" },
  ],
};
const entry: DatabaseDocumentPage = {
  id: "entry",
  parent_id: "db",
  title: "Kickoff",
  property_values: {
    owner: ["user"],
    done: true,
    notes: "<script>alert(1)</script>",
  },
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Original page body" }],
      },
    ],
  },
};

describe("database document projection", () => {
  it("includes only visible entries and resolves people without changing stored content", () => {
    const projected = pageDatabaseDocument(
      database,
      [
        database,
        entry,
        { ...entry, id: "private", parent_id: "other", title: "Private title" },
      ],
      new Map([["user", "Morgan"]]),
      (id) => `/p/token/${id}`,
    );
    const serialized = JSON.stringify(projected);
    expect(serialized).toContain("Kickoff");
    expect(serialized).toContain("Owner: Morgan");
    expect(serialized).toContain("Done: ☑");
    expect(serialized).toContain("/p/token/entry");
    expect(serialized).not.toContain("Private title");
    expect(entry.property_values?.owner).toEqual(["user"]);
  });
  it("keeps private child titles out of a publication without children", () => {
    expect(pageDatabaseDocument(database, [database], new Map())).toEqual({
      type: "doc",
      content: [],
    });
  });
  it("prepends entry properties while preserving the actual page body", () => {
    const projected = pageDatabaseDocument(
      entry,
      [database, entry],
      new Map([["user", "Morgan"]]),
    );
    expect(projected?.content?.at(-1)).toEqual(
      (entry.content as { content: unknown[] }).content[0],
    );
    expect(projected?.content?.[2].content?.[0]).toEqual({
      type: "text",
      text: "Notes: <script>alert(1)</script>",
    });
  });
  it("never infers private parent schema from an independently published entry", () => {
    expect(pageDatabaseDocument(entry, [entry], new Map())).toEqual(
      entry.content,
    );
  });
});
