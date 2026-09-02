import type { PullRequestFile } from "@/lib/agent-api";

export const LARGE_DIFF_TOKEN_LIMIT = 50_000;

/** Reserve stable scroll space before an offscreen diff is hydrated. */
export function estimatedDiffBodyHeight(file: PullRequestFile): number {
  const renderedLines = file.patch ? file.patch.split("\n").length : 5;
  return Math.min(4_000, Math.max(120, renderedLines * 20 + 16));
}
