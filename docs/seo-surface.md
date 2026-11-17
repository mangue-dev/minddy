# Public SEO surface

This document is the content and routing inventory for Minddy's indexable product site. It records which pages are intentionally indexed, the search intent each page serves, and the terminology that public copy must use.

## Positioning and terminology

The primary product description is the landing page's metadata title in `messages/en.json` (`Landing.metaTitle`):

> minddy: open-source project management for software teams

Public copy may expand that statement with issues, objectives, cycles, feedback, wiki pages, Numo, connected coding agents, minddy Cloud, and self-hosting, but it must not obscure or contradict the primary description. Change it in the catalogs, not in this document.

- **Open source:** Link to the public repository and identify the license as GNU AGPL v3.0 only. Use the repository, license, self-hosting guide, contribution paths, and public release process as evidence of transparency.
- **Desktop:** Minddy provides native desktop applications for macOS, Linux, and Windows. macOS and Linux builds are distributed by Minddy; the Windows application is distributed through Microsoft Store. All three are presented on the download hub; there is no per-platform landing page.
- **Mobile:** Minddy is available on phones and tablets as an installable progressive web app (PWA). It is not a native iOS, iPadOS, or Android application. Prefer “installable PWA,” “web app,” and “Add to Home Screen”; do not use “mobile app” or “native app” for this surface.
- **Cloud and self-hosting:** Minddy Cloud is the managed service. Self-hosted Minddy uses the same public core on infrastructure controlled by the operator. Do not imply that the Cloud subscription changes the public core's license.

## Indexable route inventory

Each route family below is published in English, French, German, Brazilian Portuguese, Italian, and Spanish. `lib/public-routes.ts` owns canonical paths, locale variants, sitemap inclusion, and modification dates.

| Route family | Search intent | Decision |
| --- | --- | --- |
| Home | Open-source issue tracker and project workspace; what minddy is and whether it is free | Retain and refresh positioning, headings, metadata, social preview, and product links. The FAQ opens with the definition and the open-source answer |
| Pricing | Minddy Cloud plans and the self-hosted boundary | Retain and refresh metadata and open-source context |
| MCP | MCP issue tracker for coding agents | Retain and refresh software entity references |
| Self-hosting | Self-hosted issue tracker; run Minddy on controlled infrastructure | Retain and keep repository, license, and installation paths prominent. The footer links to this guide, not to the installer |
| Self-hosting installer | Guided local or server setup | Retain as a lower-priority utility page |
| Downloads | All supported desktop and PWA options | Retain as the single platform hub for macOS, Linux, Windows, and the PWA |
| Mobile PWA | Install Minddy on phones and tablets | Retain as a dedicated guide with an explicit non-native boundary |
| Changelog | Current product and release history | Retain; freshness comes from the release catalog |
| Linear comparison | Open-source alternative to Linear | Retain and refresh positioning |
| Notion comparison | Open-source issue-tracking alternative to Notion | Retain and refresh positioning |
| Plane comparison | Alternative to Plane for a small software team | Retain; both products are open source, so the page compares editions, per-seat cost, and feedback boards |
| OpenProject comparison | Alternative to OpenProject for a small software team | Retain; contrasts classic project management with issue tracking |
| Taiga comparison | Alternative to Taiga for a small software team | Retain; contrasts Scrum and Kanban tooling with ready-to-use issue tracking |
| Legal, terms, privacy, cookies | Required legal and policy information | Intentionally retain with low sitemap priority |
| Documentation | How each feature works, for readers and operators | Retain; every published guide is listed in the sitemap in each locale |

The former macOS, Linux, and Windows installation pages are retired. `DESKTOP_GUIDE_REDIRECTS` in `next.config.mjs` sends their localized URLs permanently to the download hub of the same locale.

Documentation lives under `/docs` in English and under a localized root in the other locales (`documentationRoots` in `lib/documentation-core.mjs`). Only guides that `getPublishedDocumentation()` returns are public; drafts are neither linked nor listed. The legacy `/<locale>/docs` and `/<locale>/docs/<article>` URLs redirect permanently to the localized root, and `content/documentation/legacy-routes.json` maps retired guide IDs to their current article and section.

The Jira comparison is retired. `RETIRED_COMPARISON_REDIRECTS` in `next.config.mjs` sends its localized URLs permanently to the home page of the same locale.

Each comparison in `lib/comparisons.ts` carries its own `reviewedAt` date and one official source per table row. Compare with a product only while it is maintained and its official pages agree with its repository, and state what an open-source competitor's free edition includes rather than calling minddy the open-source option.

Comparison pages link each feature they claim to its published guide (`COMPARISON_FEATURE_GUIDES` in `lib/comparisons.ts`), in HTML and in the Markdown export, so a reader can check a claim against the manual.

## Commercial queries come first

A page targets the query of someone choosing a tool before the query of someone learning a topic: "open-source Linear alternative", "self-hosted issue tracker" and "MCP issue tracker" rather than "what is an issue tracker". Each such query belongs to one existing route, named in its metadata title; improve that page before adding another, and add a page only for a query no route can answer. A comparison with another product needs the same sourced table and balanced verdict as the existing ones.

Write the opening of a page and each FAQ answer so that it stands alone: name minddy, state the fact, and leave out references to the rest of the page. Search engines and assistants quote a passage without its surroundings. Google's AI features use the same index and ranking as Search and need no dedicated file or markup, so there is no separate work for them.

A page's meta description is a `metaDescription` catalog value or, for a guide, the article's `summary`. Write roughly 110 to 170 characters that name minddy and say what the page lets the reader do; Bing Webmaster Tools reports shorter descriptions, and a summary that only repeats the article's first sentence tells a searcher nothing.

A page that should rank needs a link from the shared navigation or footer; a sitemap entry alone is a weak signal. Link to the page that explains the subject, and let that page link to the tool.

Authentication pages, application routes, tokenized public boards, shared views, and published wiki pages are intentionally excluded from the sitemap. Tokenized surfaces remain `noindex`; their URLs grant access and are not discovery pages.

## Technical ownership

- `lib/public-routes.ts`: route families, localized canonical URLs, sitemap dates, and priorities.
- `lib/seo.ts`: titles, descriptions, canonical tags, reciprocal hreflang, Open Graph, and X/Twitter metadata.
- `components/marketing/structured-data.tsx`: organization, website, software, offers, license, repository, and platform data, plus the page entity and breadcrumb trail of every page below the home page and the `TechArticle` of each published guide. Declare only what the visible page says, and reuse the route table's `lastModified` or the guide's `updatedAt` as `dateModified`. `lib/structured-data.ts` holds the pure builders.
- `app/sitemap.ts`: all canonical locale variants and reciprocal sitemap alternates.
- `app/robots.txt/route.ts`: production discovery rules and non-production blocking. Use only directives Googlebot reads (`User-agent`, `Allow`, `Disallow`, `Sitemap`); Search Console reports any other line as an ignored rule, so content signals are stated in a comment.
- `next.config.mjs`: obsolete localized-slug redirects, public cache coverage, and non-production `X-Robots-Tag`.
- `lib/public-markdown-delivery.ts` and `proxy.ts`: public `.md` URLs, content negotiation, and alternate links.
- `app/md/route.ts`: localized Markdown representations and their canonical links, including shared legal content.

When adding or consolidating a public route, update these owners together and run the public-route, metadata, and English-prose checks.

## Search performance review

Search changes are judged on Search Console data, not on a paid SEO tool. No automation collects this data.

1. Export the Performance report filtered by page for the routes under review, for the last 28 complete days and the preceding 28 days, with the 90 days before as context. Record the dates, country, device, and search appearance filters.
2. Compare clicks, impressions, CTR, and average position for the same page and filters only. Do not add totals from different filters, and do not record missing data as zero.
3. Check the URL Inspection and Pages reports for canonical and indexing status, and the Sitemaps report for the last successful read.
4. Choose at most one comparison or landing page to rework, based on queries that already bring impressions. Read the current top results for that query and locale, and write down the question they answer that our page does not.
5. After the change ships, wait at least 28 days before comparing again. `landing_cta_clicked` events in PostHog show what visitors do on the page; they are not evidence of ranking.

Record the data, the decision, and the result on the Minddy issue that tracks the change, not in this repository.

## Mentions outside the site

Most of what makes a new domain rank, and most of what assistants cite for a product query, is published by third parties: directories of alternatives, curated lists of self-hosted software, reviews, and community threads. On-site changes cannot replace them.

- List minddy only where the listing is free, editorially reviewed or community-maintained, and read by people choosing a tool. Never pay for a link.
- Describe minddy with the primary description above and the same facts everywhere: license, hosting options, platforms, and the free plan.
- Keep the repository's description and topics aligned with that description; the repository is itself a search result for open-source queries.
- Register the site with Bing Webmaster Tools as well as Search Console. Bing's index also feeds other search engines and assistants.
