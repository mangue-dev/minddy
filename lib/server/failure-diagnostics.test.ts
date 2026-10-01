import { describe, expect, it } from "vitest";
import { DatabaseOperationError, failureDiagnostics } from "./failure-diagnostics";

describe("safe failure diagnostics", () => {
  it("keeps SQLSTATE and constraint names without retaining private row data", () => {
    const original = {
      code: "23514",
      message: 'new row violates check constraint "agent_runs_delegation_brief_check"',
      details: "Private prompt and row values",
      hint: "Bearer secret-token",
    };
    const error = new DatabaseOperationError("create_agent_run", original, 400);
    expect(failureDiagnostics(error)).toEqual({
      kind: "database_constraint", code: "23514",
      constraint: "agent_runs_delegation_brief_check", status: 400,
    });
    expect(error.message).toBe("Database operation failed: create_agent_run");
    expect(JSON.stringify(error)).not.toMatch(/Private|secret-token/);
    expect(error.cause).toBeUndefined();
  });

  it("recognizes unavailable databases, schema errors and transport failures", () => {
    expect(failureDiagnostics({ code: "PGRST002" }).kind).toBe("database_unavailable");
    expect(failureDiagnostics({ code: "53100" }).kind).toBe("database_unavailable");
    expect(failureDiagnostics({ code: "PGRST204" }).kind).toBe("database_error");
    expect(failureDiagnostics(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })))
      .toEqual({ kind: "transport", code: "ECONNRESET" });
    expect(failureDiagnostics({ status: 522 })).toEqual({ kind: "transport", status: 522 });
  });

  it("does not expose arbitrary names, codes, messages or cyclic causes", () => {
    const cyclic = { cause: null as unknown, message: "private", name: "private", code: "Bearer private", status: 200 };
    cyclic.cause = cyclic;
    for (const error of [cyclic, "private", null, new Error("https://private.example?token=secret")]) {
      expect(failureDiagnostics(error)).toEqual({ kind: "internal" });
    }
  });
});
