# PR #397 lightweight pre-merge documentation review

Date: 2026-10-10. Coordinator: `agent:/root`.

## Scope and method

The owner requested a lightweight reading, language and illustration pass over
the complete public manual before merging PR #397, with subagents and without
Docker. The existing `codex/min-664-public-documentation` branch was reused;
the working tree was clean and remote references were refreshed before editing.

Three agents cover the 42 guides in each language pair. Their records distinguish
reading, source checks and visual inspection from operational execution:

- [English and French](premerge-en-fr-2026-10-10.md).
- [German and Spanish](premerge-de-es-2026-10-10.md).
- [Italian and Brazilian Portuguese](premerge-it-pt-BR-2026-10-10.md).

Each pair inspected all 69 referenced PNGs per locale through contact sheets,
with full-size inspection of suspicious controls. They compared all 21 responsive
diagram definitions per locale with their SVG fallback labels. The coordinator
also inspected existing desktop-light and mobile-dark renderer evidence, read
the maintenance/editorial contracts and checked the affected technical references.
This is agent review, not human reader acceptance.

## Corrections and evidence

Affected outcome IDs: `N09`, `T06`, `F02`, `S05`, `T07`, `T05`, `T04` and
`H02`. The existing 92-row coverage ledger and its destinations are preserved.

- `minddy-mcp#access`: the Codex installation capture shows the Cloud endpoint,
  although its alternative text described a local instance. All six variants
  now identify the Cloud example and distinguish the reader's self-hosted origin.
  Figure: `external-minddy-mcp-install-workflow`. Screenshot bytes and original
  capture dates are retained.
- `minddy-mcp#pages-and-routines`: replace ambiguous or nonexistent
  `preview`/`apply` token wording with the actual `operation=convert`,
  `propertyId`, `targetType`, `revision`, `preview=true`, `incompatibleCount`,
  `preview=false`, returned `token` and explicitly authorized `confirmLoss=true`
  sequence. Split the guidance into readable paragraphs in all six languages.
  Sources: `lib/server/database-tool-schema.ts` and
  `lib/server/page-databases.ts`.
- `feedback#submit-and-follow-feedback`: complete the public dictation rules
  promised by `ai-settings-and-usage#voice-limits`. All six guides now explain
  identification, microphone access, draft review, explicit submission,
  instance/provider availability, owner billing, the 10 MiB audio cap,
  board-specific hourly transcription limits and the separate interpretation
  limit. Sources: `app/f/[token]/voice/route.ts`, `actions.ts`,
  `feedback-board-client.tsx`, `lib/server/feedback/voice.ts`, `voice-limits.ts`
  and `20270106320000_atomic_public_feedback_and_share_limits.sql`.
- `projects#project-settings`: German and Spanish incorrectly allowed digits
  in project keys. They now match the other four locales and the ASCII-only
  2–5-letter validation in `lib/project-key.ts`.
- Spanish `api-and-webhooks#limits`: format the literal `description` and
  `plan` field names as inline code.
- Spanish `numo` and `encryption-and-data-boundaries`: correct the worker-wait
  wording and translate the remaining "Exports" label. Figures:
  `numo-execution-model-flow`, `encryption-and-data-boundaries-flow`.
- Brazilian Portuguese `install-locally`: clarify that quitting stops the app
  and backend, matching the existing procedure. Figure: `install-locally-flow`.
  Each changed diagram's structured labels, alternative text and SVG fallback
  agree; longer fallback labels retain suitable wrapping.

The affected locale revisions, English source revisions, figure revisions,
actual review date and evidence references advance coherently. Unchanged
operational evidence keeps its original compatibility and qualifications.
Shared compatibility evidence is synchronized across each six-locale guide
set, including unchanged variants; adding private evidence references does
not change their public prose or establish a new operational review.
Only changed diagram text receives the current generation date; screenshots
are not relabeled as recaptured. Coverage mappings, section IDs, commands,
application code, locale catalogs, knowledge sources and existing runbooks
are unchanged.

## Validation

Before corrections, documentation and release checks reported 252 locale
articles and 92/92 workflows published. Knowledge and owned-English checks
passed. All 29 English shell examples passed `bash -n` without executing them;
translated fenced examples match apart from localized API demonstration values
and harmless line wrapping. All 57 pre-existing non-merge commits in the PR
range have sign-offs matching their authors.

After consolidation, the following checks pass:

- `npm run check:documentation`: 252 locale articles and 92/92 workflows.
- `npm run check:documentation:release`: the same complete publication set.
- `npm run check:knowledge`.
- `npm run check:owned-english`.
- `git diff --check`.

A retention comparison verifies that section IDs, coverage/related/alias
metadata and all fenced examples are unchanged. Only the public documentation
trees and their private review records are modified. All three changed SVG
fallbacks were rasterized and visually inspected after editing; text fits the
existing panels. No source/configuration behavior changed, so application
tests, a build and operational rehearsals are unnecessary for these corrections.

## Limits and minor illustration observations

No Docker, development server, application build, provider call, installation,
backup, restore, microphone recording or fresh UI capture was performed.
Focused source checks resolve the findings above; existing procedural and
release evidence is inherited rather than independently rerun. Contact sheets
establish broad asset inspection, not a pixel-level review of every image or
new responsive-rendering acceptance.

The Numo conversation captures retain the saved demonstration view's original
French name and some transient model-loading labels. A Brazilian Portuguese
feedback title approaches the close icon, and a few isolated rounded corners
retain a small background sliver. The illustrated conversations and necessary
submission/visibility controls remain readable. These are nonessential polish
observations retained in the pair reviews; they do not justify a new capture
campaign within this requested reading pass.
