import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_NAME } from "@/lib/site";

/**
 * Metadata of the pages of the internal app (MIN-95).
 *
 * Each page behind the authentication copied the same four lines of
 * `getTranslations` to put only one title; none had a
 * description. One page = one key, from now on: the namespace `Meta` carries the
 * pair `<key>` / `<key>Description`, and this actually produces the `Metadata`
 * that Next expects.
 *
 * The `robots: noindex` is NOT placed here — `app/(app)/layout.tsx` carries it once for the entire authenticated segment, and Next merges the metadata field
 * by field down the tree.
 *
 * A description on an unindexed page obviously weighs nothing for a
 * search engine. It is there so that there are no exceptions to remember
 * — a page, a title, a description — and because the same catalog serves
 * the public pages, which are indeed indexed.
 */

/** The keys in the `Meta` namespace that describe a page. */
export type MetaPageKey =
  | "home"
  | "inbox"
  | "all"
  | "agents"
  | "routines"
  | "pullRequests"
  | "statistics"
  | "trash"
  | "billing"
  | "settings"
  | "admin"
  | "project"
  | "triage"
  | "pages"
  | "objectives"
  | "projectSettings"
  | "feedback"
  | "notFound"
  | "oauthAuthorize"
  | "oauthSuccess"
  | "emailConfirmed"
  | "confirmSignIn"
  | "forgotPassword"
  | "resetPassword";

/**
 * @param scope Dynamic context attached to the title — the name of the project on the
 * subpages of a project: "Triage" + "Acme" gives "Triage · Acme · minddy".
 *
 * The mark is recomposed by hand in this case, instead of being left au
 * template "%s · minddy" of the root layout: Next resolves a `title` string to
 * `{ absolute, template: null }`, so that an intermediate layout which sets a
 * title — that of the project — CANCELS the template for its entire subtree. The
 * subpages of a project therefore left “Triage · Acme”, without a brand, where
 * all the other pages of the site carry it. An explicit `absolute` no longer depends on
 * where the page is in the tree.
 */
export async function appPageMetadata(
  key: MetaPageKey,
  scope?: string | null,
): Promise<Metadata> {
  const t = await getTranslations("Meta");
  const title = t(key);
  return {
    title: scope ? { absolute: `${title} · ${scope} · ${SITE_NAME}` } : title,
    description: t(`${key}Description`),
  };
}
