"use client";

/**
 * The LAST open page of a project, retained from one visit to the next.
 *
 * Returning to the Pages tab came up with the "choose a page on the left" screen, whereas we almost always returned there to continue the one we were reading. We therefore retain its id, per project, in `localStorage` — in the same place
 * and in the same way as the opening state of the tree
 * (components/pages/page-tree.tsx): a display preference, specific to this
 * position, which has nothing to do in base.
 *
 * What is NOT retained here: that the page still exists. She could have gone to
 * in the trash, or changed projects; it is up to the reader to check it in the
 * list before going there (see `app/(app)/projects/[id]/pages/page.tsx`).
 */

function lastPageKey(projectId: string): string {
  return `minddy.pages.last.${projectId}`;
}

export function rememberLastPage(projectId: string, pageId: string): void {
  try {
    window.localStorage.setItem(lastPageKey(projectId), pageId);
  } catch {
    // Private mode, quota full: the tab works, it doesn't remember.
  }
}

export function readLastPage(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastPageKey(projectId));
  } catch {
    return null;
  }
}

export function forgetLastPage(projectId: string): void {
  try {
    window.localStorage.removeItem(lastPageKey(projectId));
  } catch {
    /* voir rememberLastPage */
  }
}
