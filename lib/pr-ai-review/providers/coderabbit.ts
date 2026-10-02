import { requestLines, type AiReviewProvider } from "../types";

export const coderabbit: AiReviewProvider = {
  id: "coderabbit",
  logo: "/ai-review-providers/coderabbit.svg",
  name: "CodeRabbit",
  githubLogins: ["coderabbitai[bot]"],
  requestCommand: "@coderabbitai full review",
  isRequest: (body) =>
    requestLines(body).some((line) =>
      /^@coderabbitai\s+(?:full\s+)?review\s*$/i.test(line),
    ),
  // CodeRabbit uses walkthrough status markers and submitted reviews.
  reactionStates: {},
  parseMessage: ({ body, kind, verdict }) => {
    if (kind === "inline" || verdict === "changes_requested") return "findings";
    if (verdict === "approved") return "clean";
    if (
      /<!--\s*(?:This is an auto-generated comment:\s*)?review in progress/i.test(
        body,
      )
    )
      return "running";
    if (
      /<!--\s*(?:This is an auto-generated comment:\s*)?review (?:skipped|paused)/i.test(
        body,
      )
    )
      return "skipped";
    const count = body.match(/Actionable comments posted:\s*\*{0,2}\s*(\d+)/i);
    if (count) return Number(count[1]) > 0 ? "findings" : "clean";
    return kind === "review" ? "completed" : null;
  },
};
