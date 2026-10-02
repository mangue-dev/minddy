import {
  requestLines,
  type AiReviewProvider,
  type AiReviewState,
} from "../types";

export const codex: AiReviewProvider = {
  id: "codex",
  logo: "/ai-review-providers/codex.svg",
  name: "Codex",
  githubLogins: ["chatgpt-codex-connector[bot]"],
  requestCommand: "@codex review",
  isRequest: (body) =>
    requestLines(body).some((line) => /^@codex\s+review\b/i.test(line)),
  reactionStates: { eyes: "running", "+1": "clean" },
  parseActivity: (body) => {
    if (!body.includes("<!-- codex-pull-request-review-summary -->"))
      return null;
    const rows = body
      .split("\n")
      .filter((line) =>
        /^\|.*\*\*(?:Code Review|Security Review)\*\*\s*\|/.test(line),
      );
    const signals = rows.flatMap((row) => {
      const cell = row.split("|")[2] ?? "";
      let state: AiReviewState | null = null;
      if (/\*\*(?:In progress|Running|Reviewing)\*\*/i.test(cell))
        state = "running";
      else if (/\*\*(?:Queued|Pending)\*\*/i.test(cell)) state = "requested";
      else if (/\*\*Completed\*\*/i.test(cell)) state = "completed";
      else if (/\*\*(?:Failed|Error)\*\*/i.test(cell)) state = "failed";
      else if (/\*\*(?:Skipped|Cancelled|Canceled)\*\*/i.test(cell))
        state = "skipped";
      const at = cell.match(/datetime=["']([^"']+)["']/)?.[1] ?? null;
      return state ? [{ state, at }] : [];
    });
    // Code and security reviews share the bot: keep the card active until both settle.
    return (
      signals.find((signal) => signal.state === "running") ??
      signals.find((signal) => signal.state === "requested") ??
      signals.find((signal) => signal.state === "failed") ??
      signals.sort(
        (a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? ""),
      )[0] ??
      null
    );
  },
  parseMessage: ({ body, kind, verdict }) => {
    if (verdict === "changes_requested" || kind === "inline") return "findings";
    if (verdict === "approved") return "clean";
    if (
      /you(?:'ve| have) reached your .*?(?:review|usage) limit|unable to (?:complete|perform|start) (?:the |this )?review/i.test(
        body,
      )
    )
      return "failed";
    if (
      /codex review[\s:*]*(?:didn['’]t find any major issues|no (?:major )?issues|no findings)/i.test(
        body,
      )
    )
      return "clean";
    if (/codex review[\s:*]*here are some suggestions/i.test(body))
      return "findings";
    return kind === "review" ? "completed" : null;
  },
};
