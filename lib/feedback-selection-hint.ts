import type { FeedbackSort, FeedbackStateFilter } from "@/components/feedback/feedback-filter-menu";
import { isFeedbackPostStatus } from "./feedback/types";

/**
 * How the team page will pick the post it opens, sent with its list read so
 * the server can read that post along (MIN-875). Property filters and search
 * are not described: the page asks for no prepared post then.
 */
export interface FeedbackSelectionHint {
  state: FeedbackStateFilter;
  sort: FeedbackSort;
  onlyToReview: boolean;
  /** A post a link names: it wins when the list holds it. */
  post?: string;
}

const SORTS: readonly string[] = ["top", "recent", "oldest"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function writeFeedbackSelectionHint(hint: FeedbackSelectionHint, params: URLSearchParams): void {
  params.set("prepare", `${hint.state}.${hint.sort}.${hint.onlyToReview ? 1 : 0}`);
  if (hint.post) params.set("prepare_post", hint.post);
}

/** Null for a list read that asks for no prepared post, or an unknown value. */
export function readFeedbackSelectionHint(params: URLSearchParams): FeedbackSelectionHint | null {
  const raw = params.get("prepare");
  if (!raw) return null;
  const [state, sort, review] = raw.split(".");
  if (!(state === "unresolved" || state === "all" || isFeedbackPostStatus(state)) || !SORTS.includes(sort) || (review !== "0" && review !== "1")) return null;
  const post = params.get("prepare_post");
  return { state: state as FeedbackStateFilter, sort: sort as FeedbackSort, onlyToReview: review === "1",
    ...(post && UUID.test(post) ? { post } : {}) };
}
