/**
 * What the translation catalog sends to the BROWSER on the public site
 * (MIN-100).
 *
 * `NextIntlClientProvider` receives its messages as props. A component prop
 * client crosses the server → client boundary, so it is SERIALIZED in
 * the RSC inline feed of the document. The root layout gave it `getMessages()`,
 * that is to say the 67 namespaces of `messages/<locale>.json`: measured on the
 * landing, **123.6 KB raw / 39 KB gzipped — 51% of the RSC load and 44% of the
 * entire document** — to deliver the labels to the visitor of a marketing page
 * notepad, inbox, billing and administration board.
 *
 * On a page whose LCP is an image waiting behind the queue
 * download, these bytes go BEFORE it. It was the first position of
 * budget, far ahead of the client borders of animations (13.9 KB raw at
 * all of them, cf. `components/marketing/reveal.tsx`'s comment).
 *
 * The six public pages (and the 404, which renders the same chrome) only need
 * of these four namespaces. Everything else — authenticated app, screens
 * connection, feedback boards, shared views — receive the full catalog
 * depuis son propre segment, via `components/full-catalog-messages.tsx`.
 *
 * ## The root layout does not choose according to the route
 *
 * He did it, and it was a bug: a shared layout is not re-rendered when
 * of a client navigation, therefore `/login` reached from the landing inherited
 * of the four namespaces below and displayed “Auth.signIn”. What comes out of
 * root layout must be true on ALL routes; the supplement is more
 * bottom, where the segment really changes.
 *
 * ## Maintained by testing, not by hand
 *
 * `public-client-messages.test.ts` part de `app/layout.tsx`, de `not-found.tsx`
 * and `(marketing)` / `(legal)` layouts, follows the imports, and checks that everything
 * `useTranslations("X")` found in an accessible CLIENT component has its
 * `X` in the list below. Add a client component to the public site that
 * translated into an absent namespace therefore causes `npm run test` to fail, and not the
 * page in production. A second test verifies that the catalog segments
 * complet montent bien leur provider.
 */

/** Namespaces servis aux composants clients des six pages publiques. */
export const PUBLIC_CLIENT_NAMESPACES = [
  // The cookies banner, mounted by the root layout therefore present everywhere.
  "CookieBanner",
  // The nav, its product menu, the footer, the plans of the pricing page.
  "Landing",
  // The footer language selector.
  "Language",
  // Plan and quota titles, shared with the plan settings
  // facturation de l'app (`components/marketing/pricing-plans.tsx`).
  "Billing",
] as const;

/**
 * The catalog reduces to the namespaces of the public site. A namespace missing from
 * catalog is silently ignored: the test opposite is the safeguard, this
 * is not a function called on every query to become so.
 */
export function publicClientMessages<T extends Record<string, unknown>>(
  messages: T,
): Partial<T> {
  const scoped: Partial<T> = {};
  for (const namespace of PUBLIC_CLIENT_NAMESPACES) {
    const key = namespace as keyof T;
    if (key in messages) scoped[key] = messages[key];
  }
  return scoped;
}
