export { looksLikePendingAction as looksLikeUnexecutedPreamble } from "../../../ai-completion";

/** Bound correction rounds independently of the turn's elapsed time. */
export const MAX_COMPLETION_REPAIRS = 2;

export const OPENCODE_CONTINUATION_REPAIR =
  "Your previous message only announced intended actions or ended before the result; it was not a final answer. " +
  "Do not announce them again. Use the available tools now, complete the user's request, " +
  "then return the actual findings in your final reply.";
