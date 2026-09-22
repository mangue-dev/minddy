import { describe, expect, it } from "vitest";
import { checkEncryptionSchema, compareConsumers, databaseCalls, validateEncryptionPolicy } from "@/scripts/check-encryption-schema.mjs";
import schema from "@/docs/security/encryption/schema.json";
import policy from "./data-policy.json";

describe("encryption column policy", () => {
  it("classifies every recorded public-table column and pins the migration inputs", () => {
    expect(checkEncryptionSchema(process.cwd()).errors).toEqual([]);
  });

  it("rejects a new content column until its classification is reviewed", () => {
    const changed = structuredClone(schema);
    Object.assign(changed.issues.columns, { customer_notes: { type: "text", nullable: true, generated: false } });
    expect(validateEncryptionPolicy(changed, policy)).toContain(
      "issues.customer_notes: expected one classification, found 0",
    );
  });

  it("rejects contradictory or stale classifications", () => {
    const changed = structuredClone(policy);
    changed.issues.clear.operational_configuration.push("title", "missing_field");
    expect(validateEncryptionPolicy(schema, changed)).toEqual(expect.arrayContaining([
      "issues.title: expected one classification, found 2",
      "issues.missing_field: unknown column",
    ]));
  });

  it("includes derived content, private identities and files", () => {
    expect(policy.agent_run_events.encrypted).toContain("payload");
    expect(policy.agent_run_journal.encrypted).toContain("events");
    expect(policy.numo_tool_operations.encrypted).toEqual(["arguments", "model_result", "result"]);
    expect(policy.stat_events.encrypted).toContain("issue_title");
    expect(policy.page_files.encrypted).toContain("file_name");
    expect(policy.pages.encrypted).toContain("property_values");
    expect(policy.feedback_users.encrypted).toContain("email");
    expect(policy.view_shares.encrypted).toContain("token");
    expect(policy.pages.clear.remove_projection).toContain("search_tsv");
  });

  it("requires a consumer review for new, removed or redirected access, without line-number churn", () => {
    const original = [{ file: "example.ts", operation: "from", resource: "issues", storage: false, line: 10 }];
    expect(compareConsumers(original, [{ ...original[0], line: 12 }])).toBe(true);
    expect(compareConsumers(original, [...original, original[0]])).toBe(false);
    expect(compareConsumers(original, [])).toBe(false);
    expect(compareConsumers(original, [{ ...original[0], resource: "pages" }])).toBe(false);
    expect(compareConsumers(original, [{ ...original[0], file: "browser.ts" }])).toBe(false);
  });

  it("finds multiline and dynamic database calls without treating comments as calls", () => {
    const calls = databaseCalls(`
      // service.from("not_a_call")
      service.from("issues").select("title");
      service.rpc(
        "create_objective_guarded", params);
      service.from(table);
      service.storage.from("attachments");
      Array.from({ length: 5 });
      Buffer.from(secret, "utf8");
      Uint8Array.from(bytes);
    `, "fixture.ts");
    expect(calls.map(({ operation, resource, storage }) => ({ operation, resource, storage })))
      .toEqual([
        { operation: "from", resource: "issues", storage: false },
        { operation: "rpc", resource: "create_objective_guarded", storage: false },
        { operation: "from", resource: null, storage: false },
        { operation: "from", resource: "attachments", storage: true },
      ]);
  });
});
