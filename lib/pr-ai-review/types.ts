import type { ReviewReactionContent } from "@/lib/pr-review-reactions";

export type AiReviewState =
  | "requested"
  | "running"
  | "completed"
  | "clean"
  | "findings"
  | "failed"
  | "skipped";

export interface AiReviewMessage {
  body: string;
  kind: "comment" | "review" | "inline";
  verdict?: string;
}

/** A provider owns its identities, commands and wire-format interpretation. */
export interface AiReviewProvider {
  id: string;
  name: string;
  /** Bundled brand artwork, rendered with the card's current text color. */
  logo: string;
  githubLogins: readonly string[];
  requestCommand: string;
  isRequest: (body: string) => boolean;
  parseMessage: (message: AiReviewMessage) => AiReviewState | null;
  parseActivity?: (
    body: string,
  ) => { state: AiReviewState; at: string | null } | null;
  reactionStates: Partial<Record<ReviewReactionContent, AiReviewState>>;
}

/** Match commands on their own line, excluding quotes and fenced examples. */
export function requestLines(body: string): string[] {
  let fence: string | null = null;
  return body
    .split(/\r?\n/)
    .filter((line) => {
      const marker = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2].trim()
        )
          fence = null;
        return false;
      }
      return !fence && !/^\s*>/.test(line);
    })
    .map((line) => line.trim());
}
