# Smart Fill relations review (MIN-717)

Date: 2026-10-17. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope and sources

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `issues`, revision 14, workflows `W01` and `W05`: one changed paragraph in
  `create-an-issue` (relations picker hidden while Smart-fill is on), new
  sections `smart-fill-preferences` ("Choose what Smart-fill does") and
  `smart-fill-relations` ("Links added by Smart-fill").
- `instance-administration`, revision 6: new section `smart-fill-relations`
  ("Configure Smart Fill relations") for the three new admin fields and the
  save-time capability check.
- `instance-configuration`, revision 8: one row `/api/cron/issue-index`
  (`25 * * * *`) in the `schedules` table; no prose change.

Knowledge (English only): `core-tracker` gains a Smart Fill paragraph and
`settings-and-data` lists `smart_fill_relations` and `issue_indexing` under
`update_account_settings`.

Sources checked against the added passages:

- `lib/server/issue-relation-inference.ts`: the pass runs through
  `afterOrNow` after the save. It reads preferences when it runs, so turning a
  switch off cancels queued passes. Candidates come from vectors of the same
  index version, then a lexical fallback for issues that version has not
  indexed; canceled, duplicate and deleted issues are excluded; at most five
  candidates are decided and at most three relations applied. Pairs with any
  existing relation, dismissed pairs (applied then removed) and blocking cycles
  are skipped, and a result on changed text is dropped. The backfill
  (`runIssueIndexBackfill`, 100 issues per run, billed to project owners) never
  infers relations. Relations on creation follow the Smart Fill creation scopes
  and the per-issue switch; edits follow the relation switch.
- `lib/server/issue-relation-decision.ts`: one decision call classifies each
  candidate as related, blocks, blocked by or none, with abstention by default.
- `lib/server/issue-embedding-store.ts` and
  `supabase/migrations/20270109200052_issue_relation_smart_fill.sql`: vectors
  are encrypted under the project's content key and cascade with the issue;
  usage features `issue_embedding` and `issue_relation` belong to the
  Automations segment.
- `lib/server/create-issue.ts` and `lib/server/update-issue.ts`: forge imports,
  recurrence copies and forge sync never schedule a pass; an edit schedules one
  only when the title or description changes.
- `lib/server/issue-relations.ts` and `components/issue-timeline.tsx`: applied
  links are ordinary relations whose timeline actor is "Smart-fill".
- `components/settings/account-preferences-section.tsx` and the `Account`
  catalog keys: **Link related issues** depends on the Smart Fill switch,
  **Index issues** does not; `lib/smart-fill.ts` defaults both to on.
- `components/create-issue-dialog.tsx`: the Relations picker is hidden while
  Smart-fill is on; chosen relations remain as pills and are submitted.
- `lib/ai-model-config.ts`, `app/api/admin/app-config/route.ts` and
  `lib/server/model-capability-validation.ts`: the `smart_fill_relations_enabled`
  flag, `issue_embedding_model` (default `openai/text-embedding-3-small`) and
  `issue_relation_model` (default `deepseek/deepseek-v4-flash`); per-provider
  BYOK defaults; embedding and transcription fields refuse a model outside
  their catalog family, and accept the choice unverified when no catalog loads.
- `deploy/self-hosted/scheduler.mjs` and `vercel.json`: the hourly
  `issue-index` schedule.

Localized UI labels in the translated passages were taken from
`messages/<locale>.json` (`Account`, `Admin.fields`, `Billing`, `Nav`). The
catalogs use different nouns for an issue inside some labels (for example
`de` "Vorgänge" and `pt-BR` "tickets"); the articles quote those labels
exactly and keep each locale's established noun in the surrounding prose.

## Figures

No figure was recaptured or added. `new-issue` shows a draft with Smart-fill
off and manually available properties, which remains accurate.
`work-dependencies` shows the manual relation picker, which is unchanged. The
`instance-administration` figures do not show the Automations group fields.
Figure revisions were advanced with their articles without a content change.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` were run after the edits;
results are listed in the pull request.
