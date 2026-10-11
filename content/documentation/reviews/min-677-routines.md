# MIN-677 routines documentation review

Reviewed by agent:/root on 2026-10-11 against the MIN-677 working tree for the
0.11.1 candidate. This is an agent factual and language self-review, not a human
approval or evidence of a production deployment.

The audience is project owners configuring Numo work and operators running its
scheduler. The outcome is to configure one schedule, issue/feedback event or
page-database arrival, understand typed waiting conditions, inspect private
occurrences and review paused migration proposals before enabling them.

Affected workflow IDs: N06, A05, H05, H09 and H08. The stable article IDs
`scheduled-routines` and `automation-settings`, their original section anchors,
and the coverage matrix remain valid. Other affected articles are `accounts`,
`pages`, `databases`, `issues` and `instance-configuration`, in all six locales.
The new source is the same fully localized article served to the browser and
Numo; knowledge summaries were reconciled in the same change.

## Factual evidence

- `lib/routine-triggers.ts` and `routine-trigger-validation.ts`: typed filters,
  scoped references, six-level/64-node/16-KiB limits and no arbitrary expressions.
- `routine-event-processing.ts`, `routine-occurrences.ts` and the new SQL migration:
  transactional capture, ordered per-item handling, durable armings, stable
  request/conversation identity, configuration invalidation, delayed admission,
  private feedback, schema errors, service-only processing and bounded causality.
- Isolated PostgreSQL tests actually exercised source rollback, independent
  concurrent claims, expired leases, duplicate reservations, wrong ownership,
  pause/reactivation, private feedback and database restoration, trusted causal
  attribution, suppressed imports and denied authenticated access. No deployment
  database, production row or provider model call was used.
- The factory, shared Numo/MCP schemas and code-worker schema renderer were
  exercised by targeted contract regressions. Worker funding and the remaining
  occurrence budget retain the pre-existing quota semantics.
- `legacy-routine-proposals.ts`: idempotent paused proposals, preserved workflow
  instructions and effort/delay filters, owner checkpoints and a visible 15%
  default spending cap. SQL stops pending/human-waiting chains; active workers
  retain ordinary conversation controls and cannot advance a successor engine.

The initial event list follows official Linear triage/status concepts and the
n8n Notion database trigger implementation:
https://linear.app/docs/triage and
https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Notion/NotionTrigger.node.ts.
Product-specific guarantees above were verified in Minddy source and tests,
not inferred from those products.

## Language and figures

Agent:/root reviewed the complete changed en, fr, de, es, it and pt-BR texts for
retained behavior, translation meaning, localized controls, examples, links,
headings, alt text and captions. Existing unrelated procedures and controls
retain their earlier procedural evidence; no operational rerun is claimed.

Figure `scheduled-routines-workflow` uses the actual React trigger editor with
local query-cache examples and external requests blocked. Nothing was saved or
executed. Native 2x light-mode PNGs replace the obsolete schedule-only control.
Capture dimensions and checks are recorded in `min-677-editor-captures.json`.
Old automation settings figures and their public PNG variants are removed;
the transition is explained in text and links to the current routine controls.

Publication checks and broader regression results are recorded after their
actual execution. This change does not publish a release or freeze a desktop
candidate; no production or desktop publication was performed.


## Verification results

- Frozen install: Node 24.11.1, pnpm 10.28.0, `pnpm install --frozen-lockfile`.
- Full Vitest run: 1,184 suites and 10,920 tests passed; 21 suites/127 tests
  intentionally skipped, including opt-in external/isolated integration suites.
- Tooling: 247 tests passed. Production Next.js build completed.
- Isolated PostgreSQL, shared factory, trigger evaluation, quota recovery,
  transfer remapping and protected-content regressions were run separately.
  The PostgreSQL suite passed all nine checks; the retry/proposal suites
  passed all eleven checks, and inert performance fixtures passed seven checks.
- Actual editor controls were exercised through Playwright with local fixtures:
  six locales, nested AND/OR, scoped selections, numeric database comparisons
  and mobile width. Source-side durable claims were exercised on PostgreSQL;
  provider-funded Numo or worker executions and production services were not used.
- `check:documentation` and `check:documentation:release` report 252 articles
  and 92/92 workflows published in all six locales. `check:knowledge`,
  `check:owned-english`, `check:encrypted-access`, encryption inventory, lint,
  typecheck and whitespace checks passed.

## Trigger editor usability follow-up

On 2026-10-11, agent:/root reviewed the trigger configuration shared by creation
and editing. Browser selection controls were replaced with Minddy Select,
Popover/Command and Checkbox components. Trigger cards precede distinct event,
optional conditions and launch-delay sections. Numbered rules, indented AND/OR
groups, explicit removal names, app tooltips, visible focus rings and restored
focus after removal make the structure and keyboard flow easier to follow.
Single imported conditions can now be extended into groups without discarding
them. Group labels wrap on narrow screens so AND/OR remains visible. Container
width governs the trigger-card and event-field layouts.

Workflow N06, article `scheduled-routines` and figure
`scheduled-routines-workflow` were updated to revision 5 in all six locales.
Agent:/root checked the translated control labels, new instructions, alternative
text and actual light-mode captures. The English mobile PR capture was renewed.
The capture script uses only local query fixtures and blocks external requests.

Actual Playwright checks passed for arrow-key/Enter selection, searchable-person
selection, nested insertion/removal, restored focus, multiple values, boolean
false, an empty numeric input, decimals, schedule-only field visibility and
390-pixel mobile layouts. The nested French group label was checked for clipping.
The capture record contains the results and exact image dimensions. No routine
was persisted or executed.

The four relevant Vitest suites passed all 20 tests. Typecheck, lint,
`check:documentation`, `check:documentation:release`, `check:knowledge`,
`check:owned-english` and whitespace checks passed. Backend behavior and the
previous broader validation results above retain their prior evidence.
