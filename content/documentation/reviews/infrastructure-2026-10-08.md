# Documentation infrastructure review

Reviewed on 2026-10-08 by the Codex agent
`review_documentation_locales` for MIN-664. This is a source review with
synthetic reproductions, not human acceptance, a browser accessibility audit,
or an operational installation test. No implementation files were changed by
this review task.

## Scope and checks

The review covers `lib/documentation-core.mjs`,
`lib/server/documentation.ts`, `components/documentation/`,
`scripts/documentation-check.mjs`, `proxy.ts`, `next.config.mjs`, and the related
locale, metadata, sitemap, and public-route wiring.

The existing tests passed:

```sh
npx vitest run lib/documentation.test.ts lib/public-routes.test.ts lib/locale-href.test.ts lib/proxy-trust-headers.test.ts
```

Result: four files and 44 tests passed. `npm run check:documentation` also
passed, while explicitly reporting zero locale articles and zero of 90
published workflows. That result validates the empty draft infrastructure,
not publication readiness or the completeness of MIN-664.

The cases below were reproduced using temporary in-memory objects through
Node's module runner. No synthetic article was added to the public corpus.

## Actionable findings

### P1: Public links can point to an unavailable release set

In `scripts/documentation-check.mjs`, related articles need only exist. Inline
article links additionally check the destination's `status`, but not its
visibility or complete six-locale publication gate. The loader excludes those
destinations and related-article rendering silently removes them.

Reproduction: create six reviewed public variants of `public-guide` linking to
`internal-guide`; create six reviewed variants of `internal-guide` with
`visibility: internal` and `status: published`. The public source passes
`isPublishedDocumentation`; the destination does not. The checker's
`destination.status !== "published"` condition is false and its related-ID
existence test succeeds. The reader reaches a 404 from the body link. A
destination with one stale or draft translation has the same effect.

Required correction: for every link or related ID of an actually public source,
require the destination to pass the same public publication gate used by HTML,
search, and sitemap. Apply that gate when wiring Numo to this corpus too. Keep
drafts able to reference drafts where useful.
Add a focused check for internal and incomplete destinations.

### P2: Rendering disagrees with parsing about code fences and final headings

`parseDocumentation` excludes fenced code when extracting semantic headings.
`DocumentationArticleView` instead splits the raw body with a heading regex
without tracking fences. For this valid example:

````text
## Example {#example}

```md
## Literal {#literal}
```
````

The parser returns only `example`. The renderer splits into two chunks and
creates a real `literal` section, breaking the displayed example's code fence.
This affects technical articles that demonstrate Markdown syntax.

A body ending in `## Last {#last}` is also accepted by the parser. Because the
parser trims its body and the renderer requires a newline after the heading,
the renderer does not create `id="last"`. Its table-of-contents link cannot
resolve, and the literal semantic marker is rendered as ordinary heading text.

Required correction: use one fence-aware heading representation for parsing,
rendering, and anchor checks. Either reject empty trailing sections explicitly
or support their anchors consistently. Verify code-fence examples and a final
heading in a rendering-level test.

### P2: The link checker does not cover all supported Markdown links

The checker uses a regex for inline `[label](target)` links only, while
`ReactMarkdown` and `remarkGfm` also render reference links and autolinks. This
input produces no regex matches:

```text
[Next][next]

[next]: /docs/not-present
```

The broken link is rendered but never validated. Inline images are also the
only image form reliably covered by this regex.

Required correction: extract links and images from a Markdown AST shared with
the supported renderer, including reference definitions and anchors. Verify a
broken reference link and an unregistered reference-style image. Alternatively,
reject unsupported syntax in the article contract and checker instead of
silently accepting it.

### P2: Link localization is inconsistent for localized paths and root anchors

Article rendering rewrites only strings starting with `/docs` and assumes an
article suffix starts at character six. `/docs#read` therefore becomes
`/docs/read#read`, an article that the author did not request. A link already
written as `/fr/documentation/example` remains French when rendered in a German
article. Meanwhile, the checker resolves its route but looks up the destination
using the source article's locale, not the URL's locale. It can validate a
different destination from the one the reader opens.

Required correction: parse the pathname and fragment, resolve the route, and
use the shared locale-aware route helper. Define whether cross-language article
links are allowed intentionally. Make validation check the actual rendered
destination, including documentation-root anchors.

### P2: Search silently omits matching articles and does not weight headings

`searchDocumentation` defaults to 12 hits and the browser offers no pagination,
total count, or indication that more results exist. Twenty matching synthetic
articles return exactly 12. Readers cannot open the remaining matches from the
search results, even though they are published in the selected language.

The function's comment promises additional heading weight, but headings are
included only in the normalized body. An article with `alpha` in a heading and
one with `alpha` only in body text both score one. This also differs from the
accepted study's ranking of headings above ordinary body text.

Required correction: expose remaining hits through pagination or a bounded
more-results action and distinguish heading matches in ranking. Verify more
than 12 matches and heading-versus-body relevance. Keep the existing
all-query-term and accent-insensitive behavior.

### P2: Metadata presence checks do not establish usable public metadata

The checker requires `title`, `summary`, and `topic` keys but does not require
nonempty string values. The runtime publication gate does not check those
fields either. Empty metadata can therefore pass the current structural checks
and publish blank navigation or metadata. Similar shape checks are incomplete
for compatibility values and figure viewport dimensions.

Required correction: validate the typed contract at ingestion or in the shared
validator, including nonempty localized title/summary/topic, supported scalar
and array types, valid revision values, real dates, and positive figure
dimensions. Have both the offline checker and runtime loader consume that
validation. A structural validator still cannot certify editorial usefulness.

## Confirmed source-level boundaries

- Only explicit locale article directories are loaded. Review records, plans,
  repository documentation, and internal instructions are not discovered by
  the public loader.
- Each article is required to identify its locale and filename ID. Public HTML,
  search, sitemap, and the shared publication function consistently exclude
  internal, draft, stale, and incomplete six-language release sets.
- The proxy's explicit documentation branch precedes session/backend access.
  It derives locale from the URL and sanitizes incoming trusted headers. This
  supports anonymous reading independent of account cookies and Supabase
  availability at the proxy level.
- Existing private/secret route noindex prefixes are separate from the new
  documentation routes, and public cache patterns do not include those private
  prefixes. This review found no source-level broadening of their indexability.
- Article canonical/hreflang metadata and sitemap use the shared locale roots.
  Article-language links and the footer language switcher preserve the current
  fragment. Browser verification remains necessary for navigation after a
  localized rewrite and for fragment focus behavior.
- Search receives the selected locale's published articles. It is deterministic
  text search without an AI request. Inputs have a 200-character bound.
- The previously reported product-audience omission is fixed: the product
  entrance now includes member, owner, and visitor articles. Clearing the search
  now preserves the audience filter.
- Error reporting now creates a mail draft using the configured contact email.
  Its predefined fields contain only article ID, locale, and revision. It sends
  nothing automatically and requires no Minddy or GitHub account.

## Accessibility and locale checks still requiring a browser

The source supplies a labeled search input, a labeled native select, semantic
navigation, current-page states, a skip link, semantic heading anchors,
expandable mobile contents, responsive layout, and theme tokens. These support
accessibility but do not establish keyboard, mobile, contrast, or screen-reader
acceptance by themselves.

Verify the skip link actually moves focus past the potentially long topic tree;
keyboard access to overflowing tables and command blocks; visible focus in
both themes; summary controls at narrow widths; and six-language captions and
alternative text using the real figures. Confirm article and section continuity
through both language controls. At review time there was no real article or
figure set on which to perform those checks.

The date and compatibility edition/profile fields are currently displayed as
raw metadata values. Review their eventual reader-facing localization while
preserving exact executable identifiers where those matter.

## Disposition

Resolve the findings against the completed corpus, rerun failed reproductions,
and record the actual browser and operational evidence before publication
acceptance. This review does not mark any mandatory criterion complete and
does not substitute for the owner's optional French reread.
