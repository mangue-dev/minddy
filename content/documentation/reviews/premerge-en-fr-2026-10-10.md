# English and French lightweight pre-merge review

Reviewed on 2026-10-10 by `agent:/root/review_en_fr` at the owner's request.
This is an agent review, not human reader acceptance or a new operational
rehearsal.

## Coverage

- Read all 42 English guides and all 42 French guides for factual plausibility,
  retained instructions, permissions, recovery conditions and natural prose.
- Reviewed the titles, summaries and 90 figure alternative-text/caption sets in
  each locale against the article and depicted content.
- Visually inspected all 69 referenced PNGs per locale using 16 diagnostic
  contact sheets. Inspected the MCP installation dialog and French Numo
  conversation at full size after noticing potentially misleading details.
- Compared all 21 responsive diagram definitions per locale with their SVG
  fallback labels and article meaning. Reviewed the shared diagram renderer's
  reading order, selectable labels and wrapping behavior in source.
- Checked account notification controls and project-key requirements against
  source. Both English and French already correctly require 2 to 5 ASCII
  letters for project keys.

## Confirmed corrections

- `minddy-mcp`, section `external-minddy-mcp`, figure
  `external-minddy-mcp-install-workflow`: the image displays the Cloud endpoint,
  although its alternative text described a local instance. Corrected the
  alternative text and explained the Cloud example and self-hosted origin in
  the caption. The PNG itself is retained.
- `minddy-mcp`, section `pages-and-routines`: replaced the misleading
  preview/application token wording with the actual conversion protocol:
  `operation=convert`, `preview=true`, inspection of `incompatibleCount`, then
  identical settings with `preview=false` and the returned `token`.
  `confirmLoss=true` requires explicit authorization to clear incompatible
  values. Evidence: `lib/server/database-tool-schema.ts` and
  `lib/server/page-databases.ts`.
- `feedback`, section `submit-and-follow-feedback`: added the public dictation
  instructions and availability, charging and request limits promised by
  `ai-settings-and-usage#voice-limits`. Evidence:
  `app/f/[token]/voice/route.ts`, `app/f/[token]/actions.ts`,
  `app/f/[token]/feedback-board-client.tsx`,
  `lib/server/feedback/voice.ts` and `lib/server/feedback/voice-limits.ts`.

No other substantive English/French contradiction or lost instruction was
identified in this bounded pass. Canonical `/docs/` links are localized by
the HTML and Markdown renderers; they are not navigation defects. The French
Numo image contains a transient model-loading label, but its completed
conversation is readable and its caption does not claim a new execution.
No cosmetic recapture was requested.

## Limits and validation

No Docker, server, build, capture session or operational procedure ran during
this review. Contact sheets establish visual inspection of the saved assets,
not fresh desktop/mobile layout acceptance. SVG fallback text was compared;
every SVG was not independently rasterized. Source review does not prove
released provider behavior, deployment success, purchases, delivered push or
restoration. Previously recorded procedural evidence remains separate.

The coordinating agent owns the coherent six-locale revision updates and
repository checks after consolidation. This record does not claim those checks
passed before they are run.
