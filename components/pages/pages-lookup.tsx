"use client";

// What a “subpage” block needs to know about the outside world, and nothing
// more: how to read the title and icon of a page, where its link leads, how
// create one, and how to get one out of the trash.
//
// The node only stores the `pageId` (see blocks/subpage.ts) — the displayed title
// is ALWAYS resolved on reading, otherwise renaming a page would leave its
// old name in the body of all its parents. The real cache is that of
// project (lib/use-pages-query.ts), connected by components/pages/page-view.tsx:
// the sidebar, breadcrumbs and this block therefore read the same thing.

import { createContext, useContext, type ReactNode } from "react";

export interface PageSummary {
  id: string;
  title: string;
  /** The page emoji, or `null` — the default icon is then set by the view. */
  icon: string | null;
}

export interface PagesLookup {
  /** `undefined` = the page is not in the cache. What it MEANS depends on
 of `ready`: as long as the cache is loading, it's a wait; Once loaded,
 is a missing page — trashed, purged, or from another project. */
  get: (pageId: string) => PageSummary | undefined;
  /**
 * Is the project cache loaded?
 *
 * Without this boolean, the block view has no way of distinguishing "I don't know
 * yet" from "this page no longer exists", and it would therefore announce
 * one of the two incorrectly — i.e. a blink " page deleted" on each
 * loading, i.e. an eternally empty block on a truly gone page.
 */
  ready?: boolean;
  /** Where the block leads. Absent: the block surrenders, but does not click. */
  href?: (pageId: string) => string;
  /**
 * Open the page, in the current tab.
 *
 * Separated from `href` because the two answer different questions:
 * `href` gives the address — hence the ⌘-click, middle click and menu
 * browser context —, `navigate` makes APP navigation from the
 * ordinary click. Without it, the anchor would reload the entire page.
 */
  navigate?: (pageId: string) => void;
  /** Create a child page and render its id. Absent: the “/” menu places an empty block, which can be deleted. */
  create?: () => Promise<string | null>;
  /** The created page whose block has just been placed: save the parent, then
 open it. It is the caller who holds the autosave, so only he can do it in this order. */
  opened?: (pageId: string) => void;
  /**
 * Copy a page AND its descendant, and return the id of the copy (`null` if
 * it failed). This is what "duplicate" does from the menu ⋯ on a block
 * subpage: copying the BLOCK would give two links to the same document.
 */
  duplicate?: (pageId: string) => Promise<string | null>;
  /** Remove the page of an orphan block from the trash. Returns `true` if it
 returned. */
  restore?: (pageId: string) => Promise<boolean>;
  /**
 * What a block says whose page is missing from the lookup. By default "Page
 * moved to Trash", which is the only possible reason IN
 * the application.
 *
 * On a published page (MIN-283), there is a second one, and it has nothing to do with
 * see: the subpage exists very well, it is simply not published.
 * Making it say “trash” would be wrong; making him say his title would be
 * the escape that we refuse. Hence this wording, posed by the surface.
 */
  missingLabel?: string;
}

const Context = createContext<PagesLookup | null>(null);

export function PagesLookupProvider({
  value,
  children,
}: {
  value: PagesLookup;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePagesLookup(): PagesLookup | null {
  return useContext(Context);
}
