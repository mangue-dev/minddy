# Public SEO surface

This document is the content and routing inventory for Minddy's indexable product site. It records which pages are intentionally indexed, the search intent each page serves, and the terminology that public copy must use.

## Positioning and terminology

The primary product description is:

> Minddy is an open-source issue tracker and project workspace.

Public copy may expand that statement with issues, objectives, cycles, feedback, wiki pages, coding agents, Minddy Cloud, and self-hosting, but it must not obscure or contradict the primary description.

- **Open source:** Link to the public repository and identify the license as GNU AGPL v3.0 only. Use the repository, license, self-hosting guide, contribution paths, and public release process as evidence of transparency.
- **Desktop:** Minddy provides native desktop applications for macOS, Linux, and Windows. macOS and Linux builds are distributed by Minddy; the Windows application is distributed through Microsoft Store.
- **Mobile:** Minddy is available on phones and tablets as an installable progressive web app (PWA). It is not a native iOS, iPadOS, or Android application. Prefer “installable PWA,” “web app,” and “Add to Home Screen”; do not use “mobile app” or “native app” for this surface.
- **Cloud and self-hosting:** Minddy Cloud is the managed service. Self-hosted Minddy uses the same public core on infrastructure controlled by the operator. Do not imply that the Cloud subscription changes the public core's license.

## Indexable route inventory

Each route family below is published in English, French, German, Brazilian Portuguese, Italian, and Spanish. `lib/public-routes.ts` owns canonical paths, locale variants, sitemap inclusion, and modification dates.

| Route family | Search intent | Decision |
| --- | --- | --- |
| Home | Open-source issue tracker and project workspace | Retain and refresh positioning, headings, metadata, social preview, and product links |
| Pricing | Minddy Cloud plans and the self-hosted boundary | Retain and refresh metadata and open-source context |
| MCP | MCP issue tracker for coding agents | Retain and refresh software entity references |
| Self-hosting | Run Minddy on controlled infrastructure | Retain and keep repository, license, and installation paths prominent |
| Self-hosting installer | Guided local or server setup | Retain as a lower-priority utility page |
| Downloads | All supported desktop and PWA options | Retain as the platform hub and refresh platform terminology |
| macOS | Native Minddy application for macOS | Add as a dedicated search landing page |
| Linux | Native Minddy application for Linux | Add as a dedicated search landing page |
| Windows | Native Minddy application for Windows | Add as a dedicated search landing page |
| Mobile PWA | Install Minddy on phones and tablets | Add as a dedicated search landing page with an explicit non-native boundary |
| Changelog | Current product and release history | Retain; freshness comes from the release catalog |
| Linear comparison | Open-source alternative to Linear | Retain and refresh positioning |
| Jira comparison | Open-source alternative to Jira | Retain and refresh positioning |
| Notion comparison | Open-source issue-tracking alternative to Notion | Retain and refresh positioning |
| Legal, terms, privacy, cookies | Required legal and policy information | Intentionally retain with low sitemap priority |

Authentication pages, application routes, tokenized public boards, shared views, and published wiki pages are intentionally excluded from the sitemap. Tokenized surfaces remain `noindex`; their URLs grant access and are not discovery pages.

## Technical ownership

- `lib/public-routes.ts`: route families, localized canonical URLs, sitemap dates, and priorities.
- `lib/seo.ts`: titles, descriptions, canonical tags, reciprocal hreflang, Open Graph, and X/Twitter metadata.
- `components/marketing/structured-data.tsx`: organization, website, software, offers, license, repository, and platform data.
- `app/sitemap.ts`: all canonical locale variants and reciprocal sitemap alternates.
- `app/robots.txt/route.ts`: production discovery rules and non-production blocking.
- `next.config.mjs`: obsolete localized-slug redirects, public cache coverage, and non-production `X-Robots-Tag`.
- `app/md/route.ts`: negotiated Markdown representations and their canonical links.

When adding or consolidating a public route, update these owners together and run the public-route, metadata, and English-prose checks.
