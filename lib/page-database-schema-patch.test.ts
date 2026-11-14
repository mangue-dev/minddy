import { describe, expect, it } from "vitest";
import type { DatabaseProperty } from "./page-databases";
import { databaseSchemaValueChanges, patchDatabaseSchema } from "./page-database-schema-patch";

const column = (id: string, name = id): DatabaseProperty => ({ id, name, type: "text" });
const ids = (schema: DatabaseProperty[]) => schema.map((property) => property.id);

describe("patchDatabaseSchema", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => column(id));

  it("appends a column added at the end of the draft", () => {
    expect(ids(patchDatabaseSchema([a, b], [a, b], [a, b, c]))).toEqual(["a", "b", "c"]);
  });

  it("puts a column back where the draft has it, as undoing a deletion does", () => {
    expect(ids(patchDatabaseSchema([a, c], [a, c], [a, b, c]))).toEqual(["a", "b", "c"]);
    expect(ids(patchDatabaseSchema([b, c], [b, c], [a, b, c]))).toEqual(["a", "b", "c"]);
  });

  it("keeps a column another edit added meanwhile", () => {
    expect(ids(patchDatabaseSchema([a, c, d], [a, c], [a, b, c]))).toEqual(["a", "b", "c", "d"]);
    expect(ids(patchDatabaseSchema([a, b, d], [a, b], [a]))).toEqual(["a", "d"]);
  });

  it("applies a rename without undoing a newer one elsewhere", () => {
    const current = [column("a", "A"), column("b", "Newer")];
    const result = patchDatabaseSchema(current, [column("a", "A"), column("b", "B")],
      [column("a", "Alpha"), column("b", "B")]);
    expect(result.map((property) => property.name)).toEqual(["Alpha", "Newer"]);
  });

  it("drops a key the draft removed, such as a number format", () => {
    const price: DatabaseProperty = { id: "p", name: "Price", type: "number", number_format: "currency", currency: "EUR" };
    const percent: DatabaseProperty = { id: "p", name: "Price", type: "number", number_format: "percent" };
    const plain: DatabaseProperty = { id: "p", name: "Price", type: "number" };
    expect(patchDatabaseSchema([price], [price], [percent])).toEqual([percent]);
    expect(patchDatabaseSchema([price], [price], [plain])).toEqual([plain]);
  });
});

describe("databaseSchemaValueChanges", () => {
  it("clears the values of a removed column and of removed options", () => {
    const select: DatabaseProperty = { id: "s", name: "S", type: "multi_select",
      options: [{ id: "x", name: "X", color: "#000000" }, { id: "y", name: "Y", color: "#111111" }] };
    const kept = { ...select, options: select.options!.slice(0, 1) };
    expect(databaseSchemaValueChanges([column("a"), select], [kept], { a: "text", s: ["x", "y"] }))
      .toEqual({ a: null, s: ["x"] });
  });
});
