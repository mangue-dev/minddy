# Technical reference formatting review

Reviewed on 2026-10-09 by `agent:/root` against the public documentation
editorial guide. The scope was all 252 existing articles in `en`, `fr`, `de`,
`es`, `it` and `pt-BR`. This applies the owner's request to existing articles,
including figure captions and responsive diagram labels.

## Changes

The review added 1,786 inline code spans to the bodies of 22 guides per locale
and 72 spans to figure text in four guides per locale. Including the
caption-only repository skills correction, 23 guides per locale changed:
138 article files. Existing correctly formatted passages remain intact.

Affected guides: API and webhooks, applications, architecture and data flows,
authentication and email, backups and restoration, choosing an instance,
encryption and data boundaries, feedback, local installation, installation,
instance administration, instance configuration, integration troubleshooting,
Minddy MCP, Numo, pages, permissions and public links, repository skills,
self-hosted diagnostics, storage and attachments, instance updates, views,
and workspace encryption.

Technical references include environment variables, configuration assignments,
commands and flags, paths and filenames, library names, API methods and fields,
webhook headers and events, MCP tool names, literal execution states, repository
identifiers and filesystem options. Whole short commands stay in one code span,
such as `GET /api/v1/issues/options`, `compose pull --quiet` and `npm test`.
The string `"false"` remains distinct from the boolean `false`.

Context review kept ordinary words, UI labels, provider names and general
technical concepts in prose. In particular, ordinary uses of "integration",
"tasks", "apply", "console" and "effort" do not acquire code formatting just
because the same word can also name a parameter or value.

The shared figure text renderer now displays code spans with the article's
existing code style. Other figure text remains literal, including angle-bracket
placeholders, HTML-like text, asterisks and unmatched backticks. Alternative text
remains plain text for assistive technology.

## Preservation and review revisions

Article revisions, English source revisions and review revisions advance
together. Previously reviewed figures carry forward to the new article
revision: their source assets, capture dates, dimensions, alternative text and
reviewed state are unchanged. Diagram labels and captions retain the same text
after removing the new formatting markers. Existing factual and language
evidence remains attached; this formatting review does not rerun installation,
backup, restoration or other operational procedures.

A source comparison across all 138 changed articles confirmed unchanged prose
apart from backticks, unchanged compatibility and workflow metadata, and
unchanged figure assets and alternative text. Markdown token comparison across
the 132 changed bodies confirmed unchanged rendered text, links, images,
heading anchors, table structure and fenced examples after normalizing inline
code to text. No other locale content or configuration was edited.

## Verification

- `npm run check:documentation:release`: 252 articles; all 90 workflows remain
  published in all six languages.
- `npm run check:knowledge` and `npm run check:owned-english` passed.
- The six focused inline-text and documentation-table tests passed, covering
  commands, identifiers, diagram cells and captions, literal placeholders,
  HTML escaping, unmatched backticks, and existing table/sequence behavior.
- Lint passed for the six affected documentation renderer and test files.
- `git diff --check` passed.

Verification used file comparisons and DOM rendering. Browser captures and a
new local application stack were not started under the repository's local
resource constraints; interactive image-viewer behavior was not re-tested.
