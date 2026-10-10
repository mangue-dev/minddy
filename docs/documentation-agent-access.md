# Documentation access for agents

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

This work covers the official documentation. It does not add `.md` exports to
all marketing, legal, feedback, shared-view, or published workspace pages.
The existing MCP contract endpoints keep their role; a separate documentation
MCP or vector search service is unnecessary for ordinary HTTP retrieval.

The [llms.txt proposal](https://llmstxt.org/) describes a compact index, Markdown
page representations, and discovery through standard HTTP link relations.
It is a retrieval convention, not a guarantee that every assistant will discover
or follow it. [Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features)
still relies on ordinary indexing and accessible text. Keep HTML, the sitemap,
and robots policy working alongside the agent entry points.

## Maintenance and verification

Article publication automatically updates the indexes and representations.
Follow the [editorial guide](documentation-editorial-guide.md) when changing
content. Verify a representative task from the index through search to its
complete article, including commands, applicability, and section citations.

```sh
npm run test -- lib/documentation-delivery.test.ts lib/server/documentation-markdown.test.ts lib/documentation.test.ts lib/proxy-trust-headers.test.ts
npm run check:documentation
npm run check:owned-english
git diff --check
```

The delivery tests exercise all six languages, aliases, content negotiation,
publication boundaries, generated links, diagrams, code preservation, and
search. They run without a development server, browser capture, or Docker.
