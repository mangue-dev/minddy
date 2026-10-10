# German and Spanish lightweight pre-merge review

Reviewed on 2026-10-10 by the Codex German/Spanish documentation review
subagent. This is an agent review, not native-reader acceptance or a new
operational rehearsal.

## Scope and method

- Inventoried all 42 German and all 42 Spanish public feature guides against
  the English catalog. Reviewed guide structure, reader instructions, warnings,
  localized labels, figure descriptions and diagram definitions. Read the full
  bodies of all 84 articles, including fenced examples. Completed the longer
  installation, backup/restore, issues, pages and configuration guides and any
  initially truncated portions in bounded, untruncated reading batches. No
  further substantive finding emerged from completing those reads. This light
  pass does not claim a word-by-word translation certification or native-reader
  acceptance.
- Compared section lengths after removing fenced commands as an omission
  diagnostic; no substantial source section had a German or Spanish counterpart
  shorter than 80% of the English text. Length is a diagnostic, not proof that
  all meaning was retained. The root reviewer separately checked fenced-command
  parity and shell syntax across the corpus.
- Visually inspected every referenced PNG in these locales: 69 German and 69
  Spanish images, through twelve diagnostic contact sheets. Also inspected the
  Spanish Numo conversation and MCP catalog captures at full size. No missing
  controls, obviously broken captures or essential instruction/illustration
  mismatch was found in this visual pass.
- Reviewed selectable diagram definitions and SVG fallback labels for all 21
  diagram references per locale. The diagrams retain the same order and meaning.
- Checked suspicious project-key and API claims against repository source.
  Read `AGENTS.md`, the public manual contract and the editorial guide before
  reviewing or editing. No Docker, application server, browser capture batch,
  deployment, build or provider operation was started.

## Corrections

- `projects`, workflow `project-settings`: removed the claim that project keys
  accept digits. Both locales now specify two to five ASCII letters, matching
  `normalizeKey` and `isValidKey` in `lib/project-key.ts`.
- `minddy-mcp`, workflows `external-minddy-mcp` and `mcp-tool-reference`, figure
  `external-minddy-mcp-install-workflow`: corrected the claim that the captured
  Codex command targets a local instance. Its visible URL targets minddy Cloud;
  the alt text and caption now say so and direct self-hosted readers to their
  own origin. Clarified the schema-conversion protocol with `operation=convert`,
  `propertyId`, `targetType`, `revision`, `preview=true`, returned `token`, then
  `preview=false`. Clearing incompatible values through `confirmLoss=true`
  requires explicit user authorization. The root reviewer verified the protocol
  against the live tool definition in repository source. Split the reference
  into readable paragraphs without removing existing scope or permissions.
- `feedback`, workflow `submit-and-follow-feedback`: added the missing public
  board dictation procedure, visitor identification, microphone permission,
  draft-only behavior, owner billing and separate visitor/IP rate limits. The
  root reviewer verified the facts against `app/f/[token]/voice/route.ts`,
  `app/f/[token]/actions.ts`, `lib/server/feedback/voice.ts` and its rate-limit
  implementation. The existing localized submission screenshot already shows
  the microphone; no new capture was needed.
- Spanish `api-and-webhooks`, workflow `integration-api-and-webhooks`: formatted
  the literal `description` and `plan` field identifiers as inline code.
- Spanish `numo`, workflow `numo-execution-model`, figure
  `numo-execution-model-flow`: corrected the ungrammatical phrase about waiting
  for the current worker in its diagram, caption and alternative text.
- Spanish `encryption-and-data-boundaries`, figure
  `encryption-and-data-boundaries-flow`: translated the English word “Exports”
  to “Exportaciones” in its diagram and alternative text.

The two changed Spanish SVG fallbacks retain matching accessible descriptions.
The longer worker label is now split across two lines inside the existing
128-pixel panel. Arial at the declared 29-pixel size measures the lines at
416 and 181 pixels, below the available width. The revised export line measures
509 pixels and remains within its panel. These checks establish source geometry,
not browser screenshot acceptance.

## Retained observations and limits

The Numo demonstration conversation retains the saved view's French name in
German and Spanish. The captured project context and translated conversation
remain understandable; this is saved demonstration data rather than an
untranslated interface control. It does not block the described workflow. The
existing image was retained for this light pass, which does not recapture UI.

Historical operator limitations and warnings were retained. No installation,
backup, restoration, live OAuth authorization or external delivery was rerun.
Passing metadata checks cannot establish those operations or native-language
reader acceptance. Revision/source-revision alignment and the final
documentation, knowledge and owned-English checks are handled by the root
reviewer after integrating the six-locale corrections.
