# MIN-670 feedback objective review

Date: 2026-10-10. Reviewer: Codex `agent:/root`. This is an agent source,
language and component review, not human acceptance or a deployed-version check.

## Article brief and coverage

Project members need to associate requests with an outcome and find those requests
from the objective. Owners need an ingestion default for documentation feedback.
Agents need explicit linking tools and a rule preventing automatic assignment.
The candidate applies to Cloud and self-hosted web, mobile and desktop clients;
self-hosted installations need the new migration before using these fields.
No desktop version is changed by this PR.

Affected articles: `feedback`, `objectives`, `api-and-webhooks`, `minddy-mcp`,
`numo` in `en`, `fr`, `de`, `es`, `it`, `pt-BR`; internal knowledge: `feedback`.
Affected workflows: `F03`, `F04`, `W10`, `W11`, `T07`, `F06`, `T06`, `N09`, `N01` (existing article
workflow mappings remain unchanged). Figure: `feedback-objective-selection`.
Existing figures in the other guides retain their evidence: their illustrated
steps remain accurate. The former moderation detail capture is replaced because
it omitted the new objective property. The new figure explains the two selectors;
comment moderation remains described in prose.

## Claim evidence

- `lib/server/feedback/posts.ts` and `objective.ts`: explicit nullable choices,
  project/live-objective validation, stale suggestion clearing and change events.
- `lib/server/integrations.ts`, `integration-auth.ts`,
  `app/api/v1/feedback/route.ts`: owner-configured defaults on feedback keys only;
  future submissions inherit the setting, including the review opt-out; unavailable
  objectives return `422 objective_not_found`.
- `lib/server/feedback/promote.ts`, `create-issue.ts`: promotion inherits objective
  and categories; human form overrides remain possible; objective inference is
  disabled while other Smart Fill fields retain their existing behavior.
- `lib/server/feedback/review.ts`, `embeddings.ts` and
  `supabase/migrations/20270109200032_feedback_objectives.sql`: objective-scoped
  duplicate search, no review objective writes, and a database guard against
  conflicting merges under the merge RPC's existing locks.
- `components/feedback/feedback-team-page.tsx`,
  `components/integrations/create-integration-wizard.tsx`,
  `components/project-integrations.tsx`: existing localized ObjectiveValue selector
  reused for feedback creation, editing, integration creation and default editing.
- `components/objective-feedback-section.tsx` and
  `app/api/objectives/[id]/feedback/route.ts`: linked requests remain team-only;
  the endpoint authorizes the objective's project before reading private feedback.
  Feedback does not alter objective issue counts or momentum.
- `lib/server/assistant/tools.ts`, `execute-tool.ts`, `prompt.ts`,
  `lib/server/mcp/tools.ts`: explicit linking/removal, integration defaults,
  objective-aware list/detail reads and tools advertised in the generated catalog.
- `lib/feedback/integration-contract.ts`, `lib/server/integration-prompt.ts`:
  ingestion instructions describe inherited defaults in all six runtime locales.

## Visual and language evidence

Playwright rendered the actual `ObjectiveValue`/`PropertyRow` controls in a local
component fixture, with the project's stylesheet, translations and demonstration
objective `Docs`. The fixture isolates network/auth/quick-create dependencies;
it is not a screenshot of a signed-in or deployed application. Selection of
`None` and restoration of `Docs` were checked through the real searchable picker.
All six figures are native 2x captures in light mode, without production data.
Their captions and alternatives identify them as component previews. The English
and French captures were inspected at full size, and all six were inspected as a
contact sheet for wrapping and localized labels. No provider, SMTP, production
key, server write or deployment was used. Existing unaffected text and procedural
evidence are retained; newly added text is reviewed against the sources above.

## Verification

Targeted Vitest suites cover creation/editing, inaccessible/deleted objectives,
review opt-out, defaults, promotion and Smart Fill, scoped reads and tool contracts.
The migration was executed with disposable PGlite PostgreSQL using minimal tables;
checks exercised cross-project foreign keys, issue-key rejection, conflicting and
compatible merges, objective deletion preserving project IDs while clearing
links, and mixed content/objective saves with merged-post rejection. This is
actual SQL execution, not full hosted Supabase integration testing.
TypeScript, lint, documentation, knowledge, owned English and whitespace checks
are recorded in the PR after final verification.
