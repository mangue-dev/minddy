# Public site and documentation access for agents

Minddy serves public documentation through ordinary HTTP requests. An assistant
can discover it through web search or the existing sitemap, read HTML, or fetch
Markdown without authentication, an SDK, or an MCP connection. Public articles
remain server-rendered and carry canonical and language metadata.

## Discovery and retrieval

Replace the example origin below with the target Minddy instance's origin.
All generated links use that instance's configured public origin.

| Resource | Purpose |
| --- | --- |
| `/llms.txt` | Site entry point linking to product documentation and the existing MCP overview. |
| `/docs/llms.txt` | Generated English documentation index with article summaries, Markdown links, retrieval guidance, and links to the other languages. |
| `/docs/index.md` or `/docs.md` | Markdown article index. Add `q` to search article titles, summaries, tags, and bodies. |
| `/docs/issues.md` | Complete published article, including applicability metadata, contents, stable section IDs, figure descriptions, and related links. |
| `/docs/issues` with `Accept: text/markdown` | The same article representation through content negotiation. |
| `/llms-full.txt` | Generated MCP tool and integration reference, separate from product procedures. |
| `/sitemap.xml` | Canonical public HTML pages for ordinary search discovery. |

Each documentation root supports the same index and article suffixes:
`/docs`, `/fr/documentation`, `/de/dokumentation`, `/es/documentacion`,
`/it/documentazione`, and `/pt-br/documentacao`.

```sh
curl -fsS https://minddy.example.com/docs/llms.txt
curl -fsS https://minddy.example.com/fr/documentation/issues.md
curl -fsS -H 'Accept: text/markdown' https://minddy.example.com/docs/issues
curl -fsS --get --data-urlencode 'q=implementation plan' https://minddy.example.com/docs/index.md
```

An agent should first choose the user's language and find the relevant guide,
then read its procedure and prerequisites. Search uses the same accent-insensitive
ranking as the documentation UI, requires every query term, and returns links to
matching sections with excerpts. Queries are limited to 200 characters and are
not translated. Try fewer terms or browse the index when no result matches.
Search excerpts help select a source; they do not replace the complete procedure.

The Markdown article exposes a canonical HTML URL and links its contents to
stable HTML section fragments for citations. In article prose, documentation
links lead to localized Markdown; section-only links point to canonical HTML
anchors. Existing legacy article URLs resolve to their published feature guide.

HTML responses advertise Markdown with an HTTP `Link` header using
`rel="alternate"; type="text/markdown"`, and the localized index using
`rel="describedby"`. Markdown responses include canonical and index links,
`Content-Language`, and `Vary: Accept`. Explicit Markdown requests respect
`q=0` and a higher HTML preference. Ordinary browser and wildcard requests
continue to receive HTML. The English Markdown index has a stable language,
even if the requesting browser prefers another language.

## Publication and scope

All exports call `getPublishedDocumentation`, just like the sitemap and Numo.
Drafts, internal articles, incomplete locale sets, unreviewed revisions, and
local preview-only content are excluded. Unknown article paths return `404`.
Exports include public applicability metadata, not raw frontmatter, internal
evidence paths, or review identities. They need no Supabase session and remain
available during a backend outage.

Structured diagrams are rendered as lists or tables from their actual metadata.
Screenshots retain their image links, alternative text, and captions. Fenced
commands and inline code are preserved verbatim. The original locale prose and
its safety, permission, release, and edition boundaries remain authoritative.

The same retrieval convention covers every registered public site page in
`lib/public-routes.ts`, across all six locales. Append `.md` to the localized
HTML URL, for example `/pricing.md`, `/fr/tarifs.md`, or
`/pt-br/auto-hospedagem/instalar.md`. Use `/index.md` for the English landing
page; `/.md` also supports a literal suffix on `/`. Localized landing pages use
`/fr.md`, `/de.md`, `/es.md`, `/it.md`, and `/pt-br.md`.

Site HTML advertises the suffix URL with an alternate `Link` header. Both
representations vary on `Accept`; an explicit suffix always selects Markdown,
while negotiation respects quality values and a higher HTML preference.
Markdown carries `Content-Type: text/markdown; charset=utf-8`,
`Content-Language`, the canonical HTML link, and `noindex, follow` to keep HTML
as the search result. Text retrieval does not read or rotate account sessions,
bounce signed-in readers into the app, or redirect according to locale cookies.
It also works when Supabase is unconfigured or unavailable.

Product pages keep their existing text-oriented grouping and shared translation
keys. Legal exports project the same server components as HTML, preserving all
paragraphs, lists, external links, and cookie tables. The installation wizard's
static representation describes its choices and links to the published local,
server, compatibility, and encryption procedures; use those complete procedures
before installing, rather than inferring choices from an interactive wizard.
No rewriting service or second set of product claims is involved.

Existing `/md?route=<key>&locale=<locale>` links remain supported. A suffix URL
selects its registered page and language regardless of conflicting query values.
Unknown site suffixes are not mapped to an unrelated page. Authentication pages,
application screens, tokenized feedback boards, shared views, and published
workspace pages are outside this site's export contract.
The existing MCP contract endpoints keep their role; a separate documentation
MCP or vector search service is unnecessary for ordinary HTTP retrieval.

The [llms.txt proposal](https://llmstxt.org/) describes a compact index, Markdown
page representations, and discovery through standard HTTP link relations.
[Mintlify's agent documentation](https://github.com/mintlify/docs/blob/main/ai-native.mdx)
also exposes page Markdown through `.md` URLs, and
[Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)
uses `Accept: text/markdown` and `Vary: Accept`. These sources informed the
suffix, discovery, and content-negotiation contract above. Keep the same facts
and applicability limits in both representations, with concise headings, lists,
and canonical citations for text readers. This is a retrieval convention, not a
guarantee that every assistant will discover or follow it.
[Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features)
still relies on ordinary indexing and accessible text. Keep HTML, the sitemap,
and robots policy working alongside the agent entry points.

## Maintenance and verification

Article publication automatically updates the indexes and representations.
Follow the [editorial guide](documentation-editorial-guide.md) when changing
content. Verify a representative task from the index through search to its
complete article, including commands, applicability, and section citations.

```sh
npm run test -- lib/public-markdown-delivery.test.ts lib/server/public-markdown.test.ts lib/documentation-delivery.test.ts lib/server/documentation-markdown.test.ts lib/documentation.test.ts lib/proxy-trust-headers.test.ts
npm run check:documentation
npm run check:knowledge
npm run check:owned-english
git diff --check
```

The delivery tests exercise all registered site routes in six languages, full
legal bodies and cookie tables, installer sources, aliases, content negotiation,
publication boundaries, generated links, diagrams, code preservation, and
search. They run without a development server, browser capture, or Docker.
