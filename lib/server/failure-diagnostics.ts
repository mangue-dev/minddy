/** Structural failure metadata that is safe to log and return to Numo. */
export interface FailureDiagnostics {
  code?: string;
  constraint?: string;
  status?: number;
  kind: "database_constraint" | "database_unavailable" | "database_error" | "transport" | "internal";
}

const TRANSPORT_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"]);

/** Never copy error messages, details, hints, response bodies, or stacks. */
export function failureDiagnostics(error: unknown): FailureDiagnostics {
  if (error instanceof DatabaseOperationError) return error.diagnostics;
  if (!error || typeof error !== "object") return { kind: "internal" };
  const value = error as { code?: unknown; message?: unknown; status?: unknown; cause?: unknown; name?: unknown };
  const code = typeof value.code === "string" &&
    (/^[0-9A-Z]{5}$/.test(value.code) || /^PGRST\d{3}$/.test(value.code) || TRANSPORT_CODES.has(value.code))
    ? value.code : undefined;
  const status = typeof value.status === "number" && Number.isInteger(value.status) &&
    value.status >= 400 && value.status <= 599 ? value.status : undefined;
  const constraint = code?.startsWith("23") && typeof value.message === "string"
    ? value.message.match(/violates (?:check|unique|foreign key) constraint "([a-z][a-z0-9_]{0,100})"/)?.[1]
    : undefined;
  let kind: FailureDiagnostics["kind"] = "internal";
  if (code?.startsWith("23")) {
    kind = "database_constraint";
  } else if (code?.startsWith("08") || code?.startsWith("53") || code?.startsWith("57") ||
      code === "PGRST000" || code === "PGRST001" || code === "PGRST002") {
    kind = "database_unavailable";
  } else if (code && !TRANSPORT_CODES.has(code)) {
    kind = "database_error";
  } else if (code || status || value.name === "AbortError" || value.name === "TimeoutError") {
    kind = "transport";
  }
  if (kind === "internal" && value.cause && value.cause !== error) {
    // Inspect one cause only; arbitrary cause chains may contain cycles.
    const cause = value.cause as { code?: unknown };
    if (typeof cause.code === "string" && TRANSPORT_CODES.has(cause.code)) {
      return { kind: "transport", code: cause.code };
    }
  }
  return { kind, ...(code ? { code } : {}), ...(constraint ? { constraint } : {}), ...(status ? { status } : {}) };
}

/** Retain database metadata without retaining row values in an exception. */
export class DatabaseOperationError extends Error {
  readonly diagnostics: FailureDiagnostics;

  constructor(readonly operation: string, error: unknown, status?: number) {
    super(`Database operation failed: ${operation}`);
    this.name = "DatabaseOperationError";
    this.diagnostics = failureDiagnostics(error);
    if (status && Number.isInteger(status) && status >= 400 && status <= 599) {
      this.diagnostics = { ...this.diagnostics, status };
    }
  }
}
