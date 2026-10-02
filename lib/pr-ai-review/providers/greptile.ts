import { requestLines, type AiReviewProvider } from "../types";

export const greptile: AiReviewProvider = {
  id: "greptile",
  logo: "/ai-review-providers/greptile.svg",
  name: "Greptile",
  githubLogins: ["greptile-apps[bot]", "greptile[bot]"],
  requestCommand: "@greptileai",
  isRequest: (body) =>
    requestLines(body).some((line) =>
      /^@greptileai(?:\s+review\b.*)?\s*$/i.test(line),
    ),
  // A thumbs-up means finished, including reviews that found problems.
  reactionStates: { eyes: "running", "+1": "completed", confused: "failed" },
  parseMessage: ({ body, kind, verdict }) => {
    if (kind === "inline" || verdict === "changes_requested") return "findings";
    if (verdict === "approved") return "clean";
    if (
      /\bConfidence Score:\s*\*{0,2}\s*[0-5]\s*\/\s*5\b/i.test(body) ||
      /^#{1,6}\s+Greptile Summary\b/im.test(body)
    )
      return "completed";
    return kind === "review" ? "completed" : null;
  },
};
