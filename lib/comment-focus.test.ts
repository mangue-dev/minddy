// ⇧C (MIN-803): a request reaches the composer of its target whichever of the
// two comes first, opens the surface showing that target, and is spent once
// delivered or after it expires.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  COMMENT_FOCUS_TTL_MS,
  commentTarget,
  focusCurrentCommentSurface,
  registerCommentComposer,
  registerCommentSurface,
  requestCommentFocus,
  resetCommentFocus,
} from "@/lib/comment-focus";

const issueA = commentTarget("issue", "a");
const issueB = commentTarget("issue", "b");

beforeEach(() => {
  resetCommentFocus();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("focuses a composer that is already mounted", () => {
  const focus = vi.fn();
  registerCommentComposer(issueA, focus);
  requestCommentFocus(issueA);
  expect(focus).toHaveBeenCalledTimes(1);
});

it("waits for the composer of its target, then is spent", () => {
  requestCommentFocus(issueA);
  const other = vi.fn();
  registerCommentComposer(issueB, other);
  expect(other).not.toHaveBeenCalled();

  // The panel's content renders after the panel: the field arrives later.
  const focus = vi.fn();
  const unregister = registerCommentComposer(issueA, focus);
  expect(focus).toHaveBeenCalledTimes(1);

  // Opening the same issue again later does not focus the field again.
  unregister();
  registerCommentComposer(issueA, focus);
  expect(focus).toHaveBeenCalledTimes(1);
});

it("opens the surface showing its target, even one registered afterwards", () => {
  const open = vi.fn();
  registerCommentSurface(commentTarget("page", "p"), open);
  requestCommentFocus(commentTarget("page", "p"));
  expect(open).toHaveBeenCalledTimes(1);

  // A sidebar row navigates first: the page view mounts after the request.
  const openObjective = vi.fn();
  requestCommentFocus(commentTarget("objective", "o"));
  registerCommentSurface(commentTarget("objective", "o"), openObjective);
  expect(openObjective).toHaveBeenCalledTimes(1);
});

it("expires a request no composer took", () => {
  requestCommentFocus(issueA);
  vi.advanceTimersByTime(COMMENT_FOCUS_TTL_MS + 1);
  const focus = vi.fn();
  registerCommentComposer(issueA, focus);
  expect(focus).not.toHaveBeenCalled();
});

it("targets the surface most recently shown when nothing is hovered", () => {
  expect(focusCurrentCommentSurface()).toBe(false);

  const objective = vi.fn();
  const panel = vi.fn();
  registerCommentComposer(commentTarget("objective", "o"), objective);
  registerCommentSurface(commentTarget("objective", "o"));
  const closePanel = registerCommentSurface(issueA);
  registerCommentComposer(issueA, panel);

  expect(focusCurrentCommentSurface()).toBe(true);
  expect(panel).toHaveBeenCalledTimes(1);
  expect(objective).not.toHaveBeenCalled();

  // The panel closes: the objective behind it is the view on screen again.
  closePanel();
  focusCurrentCommentSurface();
  expect(objective).toHaveBeenCalledTimes(1);
});
