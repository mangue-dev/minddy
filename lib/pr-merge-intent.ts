"use client";

import { create } from "zustand";

/**
 * A merge asked from outside the Code review page (a board card's menu): the
 * pull request opens in its tab and its detail opens the same merge dialog as
 * the page's own “Merge” (commit message, method, Numo merge), gated by the
 * same fresh read. A tab keeps only its selection parameters, so the request
 * travels here rather than in the address.
 */
export const usePrMergeIntentStore = create<{ prId: string | null }>(() => ({ prId: null }));

export function requestPullRequestMerge(prId: string): void {
  usePrMergeIntentStore.setState({ prId });
}

/** Takes the pending request for `prId`, if there is one. */
export function takePullRequestMerge(prId: string): boolean {
  if (usePrMergeIntentStore.getState().prId !== prId) return false;
  usePrMergeIntentStore.setState({ prId: null });
  return true;
}
