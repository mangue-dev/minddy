# Italian and Brazilian Portuguese lightweight pre-merge review

Reviewed on 2026-10-10 by `agent:/root/review_it_pt` at the owner's request.
This records an agent review, not human reader acceptance or a new operational
rehearsal.

## Coverage

- Read all 42 Italian guides and all 42 Brazilian Portuguese guides, including
  titles, summaries, captions, alternative text and responsive diagram labels.
  Checked factual plausibility, useful instructions, permissions, recovery
  conditions and natural phrasing. Compared the locale instructions and
  structure with English; this does not claim a second complete English
  editorial review.
- Compared heading IDs and order, workflow coverage, required figures and
  related-article metadata with English. Compared fenced operational examples
  with English without executing them; reviewed intentionally localized API
  and MCP examples separately.
- Visually inspected all 69 referenced PNGs per locale using twelve diagnostic
  contact sheets. Inspected both public feedback submission dialogs and the
  Italian database conversion warning at full size where framing or label
  placement needed a closer look.
- Compared all 21 responsive diagram definitions per locale with the labels
  in their SVG fallbacks. Rasterized and visually inspected the corrected
  Portuguese local-installation SVG to check wrapping within its existing box.
- Checked conversion guards and public feedback voice limits, charging and
  authentication against source. Italian and Portuguese project instructions
  already correctly specify 2 to 5 ASCII letters for project keys.

## Confirmed corrections

- `minddy-mcp`, workflow `external-minddy-mcp`, figure
  `external-minddy-mcp-install-workflow`: clarified that the saved Codex dialog
  displays the minddy Cloud endpoint. Removed the Portuguese local-instance
  claim and explained the Cloud example and self-hosted origin in both
  captions. The saved PNGs are retained.
- `minddy-mcp`, section `pages-and-routines`, workflow `mcp-tool-reference`:
  replaced nonexistent preview/application token wording with the conversion
  protocol: `operation=convert`, `propertyId`, `targetType`, `revision` and
  `preview=true`; inspect `incompatibleCount`, then send the same settings with
  `preview=false` and the returned `token`. `confirmLoss=true` requires explicit
  authorization to clear incompatible values. Split page edits, conversions
  and routine/resource scope into readable paragraphs. Evidence:
  `lib/server/database-tool-schema.ts`, `lib/server/page-databases.ts` and
  `lib/server/page-database-conversion-protected.ts`.
- `feedback`, workflow `submit-and-follow-feedback`: added translated public
  dictation instructions, availability, owner charging and the separate
  recording/transcription/draft limits promised by
  `ai-settings-and-usage#voice-limits`. Used the existing localized Send labels.
  Evidence: `app/f/[token]/voice/route.ts`, `app/f/[token]/actions.ts`,
  `lib/server/feedback/voice.ts`, `lib/server/feedback/voice-limits.ts` and
  `messages/it.json` / `messages/pt-BR.json`.
- `install-locally`, figure `install-locally-flow`, Portuguese only: replaced
  ambiguous quit wording with a clear statement that quitting stops the
  application and backend. Updated responsive labels, alternative text and
  SVG fallback together. The fallback uses two lines within the existing box.

No other substantive Italian/Portuguese contradiction or missing instruction
was identified in this bounded pass. Some awkward UI labels in the images
match the current translation files and were retained as actual controls.

## Remaining illustration polish and limits

The Portuguese feedback submission image has a long title that approaches the
close icon, while the documented form fields and Send action remain readable.
Some isolated dialogs and menus retain small pieces of their underlying UI at
rounded edges. The Portuguese Numo conversation includes a transient
model-loading label, while its completed response remains readable. These are
minor saved-image polish observations; no new capture session ran.

No Docker, server, browser session, build or operational procedure ran during
this review. Contact sheets establish visual inspection of the saved assets,
not fresh desktop/mobile layout acceptance. SVG labels were compared; only
the changed Portuguese fallback was independently rasterized. Source review
does not prove released provider behavior, deployment success, delivered
notifications, purchases or restoration. Existing procedural evidence remains
separate.

The coordinating agent owns coherent six-locale revision updates and
repository checks after consolidation. This record does not claim those checks
passed before they are run.
