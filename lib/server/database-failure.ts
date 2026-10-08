import "server-only";

/** Retain operational categories without logging SQL, URLs or provider bodies. */
export function databaseFailure(error: { code?: string; message?: string }, status: number) {
  const code = typeof error.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code)
    ? error.code : "unknown";
  const message = error.message ?? "";
  const kind = /timeout|timed? out|abort/i.test(message) ? "timeout"
    : /fetch failed|failed to fetch|network/i.test(message) ? "transport" : "database";
  return { code, kind, status: Number.isSafeInteger(status) && status >= 0 && status <= 599 ? status : 0 };
}
