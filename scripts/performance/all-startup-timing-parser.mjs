/** Parse only the fixed, public timing grammar emitted by the request-scoped diagnostic. */
export function parseAllStartupTiming(value) {
  const reject = () => { throw new Error("Invalid fixed All-startup timing metadata"); };
  if (typeof value !== "string" || !value.length || value.length > 8192) reject();
  const names = new Set(["auth", "cycles", "issues", "issues_db", "issues_decode", "projects", "categories", "objectives", "relations",
    "members", "members_db", "members_identity", "members_avatar", "integrations", "integrations_decode", "json"]);
  // The only accepted quoted comma is the fixed calls/start separator.
  const items = value.split(/,\s*(?=all_)/);
  const phases = {}, numeric = (part) => {
    const number = Number(part);
    if (!Number.isFinite(number) || number < 0 || number > 1e9) reject();
    return number;
  };
  let totalMs;
  for (const item of items) {
    const total = /^all_total;dur=(\d+\.\d)$/.exec(item);
    if (total) { if (totalMs !== undefined) reject(); totalMs = numeric(total[1]); continue; }
    const phase = /^all_([a-z_]+);dur=(\d+\.\d);desc="calls:([1-9]\d*),start:(\d+\.\d)"$/.exec(item);
    if (!phase || !names.has(phase[1]) || phases[phase[1]]) reject();
    const calls = Number(phase[3]);
    if (!Number.isSafeInteger(calls) || calls > 1e6) reject();
    phases[phase[1]] = { durationMs: numeric(phase[2]), calls, firstStartOffsetMs: numeric(phase[4]) };
  }
  if (totalMs === undefined || !Object.keys(phases).length) reject();
  return { totalMs, phases };
}

/** Inspect complete response identities and content in memory; export only counts and a digest. */
export function verifyBoardResponse(board, expected, fingerprint) {
  if (!Array.isArray(board?.issues)) throw new Error("All-startup response has no complete issue source");
  const issues = [...board.issues].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const ids = new Set(issues.map((issue) => issue.id));
  const contentFingerprint = fingerprint(issues);
  const cards = issues.filter((issue) => !["triage", "duplicate"].includes(issue.status));
  const cardIds = cards.map((issue) => issue.id).sort();
  if (issues.length !== expected.sourceIssues || ids.size !== issues.length || contentFingerprint !== expected.contentFingerprint ||
      cards.length !== expected.cards || JSON.stringify(cardIds) !== JSON.stringify(expected.cardIds)) {
    throw new Error("All-startup response identity, content or count differs from the complete verified source");
  }
  return { completeIssueSource: true, sourceIssues: issues.length, kanbanCards: cards.length, uniqueIssues: ids.size, contentFingerprint };
}
