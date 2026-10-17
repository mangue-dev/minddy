# Hybrid issue search review (MIN-718)

Date: 2026-10-17. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope and sources

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `navigation`, revision 9, workflows `S04` and `W15`: new section
  `search-by-meaning` under `search-and-shortcuts`, the main passage. It lists
  the covered surfaces, the ordering guarantees, the limits (query shape,
  identifiers, unindexed issues, the author's and searcher's **Index issues**
  switch, the instance switch, budget and provider failure) and the cost.
- `issues`, revision 15: one sentence each in `triage-incoming-work` (duplicate
  picker) and `issue-dependencies` (relation picker); the **Index issues**
  bullet in `smart-fill-preferences` now says it governs search by meaning;
  the usage paragraph of `smart-fill-relations` adds the **Issue search**
  history label.
- `pages`, revision 11: one sentence on `@` mentions in `page-editor`.
- `feedback`, revision 11: one sentence on **Link to an existing issue** in
  `work`.
- `code-work`, revision 12: one sentence on **Link an issue** in `link-work`.
- `numo`, revision 14: one sentence on `@` and **Add context** → **Issue** in
  `work-with-numo`, one on Numo's issue search in `continue`.
- `minddy-mcp`, revision 9: one paragraph on `minddy_list_issues` with `query`
  at the start of `issue-plans`.
- `instance-administration`, revision 7: the **Smart Fill relations** and
  **Issue embeddings** bullets in `smart-fill-relations` now cover search by
  meaning.

Knowledge (English only): `core-tracker` gains a hybrid search paragraph and
`agents-and-mcp` describes the `minddy_list_issues` and Numo search order.

`ai-settings-and-usage` lists usage segments, not history labels, and needs no
edit. Boards and lists have filters but no free-text search box, so no board
passage was added.

Sources checked against the added passages:

- `lib/issue-semantic-query.ts`: `isSemanticQuery` accepts two or more words
  with at least six letters or digits in total, or one word of at least six
  letters; identifier-like input (`MIN-42`, `#42`, `42`, `min-`, `min 42`) is
  refused; queries are cut at 300 characters. `semanticExtras` appends at most
  five eligible, not yet shown issues.
- `lib/server/issue-semantic-search.ts` and
  `app/api/issues/semantic-search/route.ts`: the query is embedded with the
  searching user's runtime for `issue_embedding_model` and compared only with
  vectors of the same index version; scope is the readable projects (at most
  25); trashed issues are excluded; 4 s deadline, similarity floor 0.3. One
  embedding call per distinct query, billed under `issue_search` to the
  searching user after a budget check, with a per-user query cache of
  15 minutes. Disabled by `smart_fill_relations_enabled`, by the user's
  `issue_indexing` preference, an exhausted budget or a provider failure; the
  pickers then keep their text results.
- `lib/use-semantic-issue-search.ts`: 350 ms debounce, aborted and
  out-of-order responses ignored, session cache of ids.
- Surfaces: `components/command-palette.tsx` (all readable projects, not in
  bulk mode nor the destination launcher; results appended last by
  `lib/command-palette/views/SearchView.tsx`), `lib/use-semantic-mentions.ts`
  with `components/markdown-mention.tsx`, `components/mention-textarea.tsx` and
  `components/assistant/chat-input.tsx`, `components/relation-target-picker.tsx`,
  `components/relations-section.tsx`, `components/creation-relations.tsx`,
  `components/objective-relations-section.tsx`,
  `components/triage/triage-page.tsx`, `components/pull-requests/pr-link-issue.tsx`
  (issues of the pull request's project not yet linked),
  `components/assistant/assistant-context-bar.tsx` and
  `components/feedback/feedback-team-page.tsx` (canceled and duplicate issues
  excluded).
- `lib/server/issue-reads.ts` (`searchIssues`), `lib/server/mcp/tools.ts` and
  `lib/server/assistant/tools.ts`: exact identifiers and text matches first;
  issues found by meaning in the same project fill the remaining slots, marked
  `match: "semantic"`, only when the caller has a user.
- `lib/usage-features.ts` and `lib/server/ai-usage-shape.ts`: `issue_search`
  belongs to the Automations segment.

Localized UI labels were taken from `messages/<locale>.json`:
`Picker.relatedByMeaning`, `Billing.historyFeatureIssueSearch`,
`Billing.segmentAutomations`, `Account.issueIndexingLabel`,
`Admin.fields.smart_fill_relations_enabled.label`,
`Triage.markDuplicate`, `PullRequests.linkIssue`, `FeedbackBoard.linkToIssue`,
`Assistant.addContext` and `Assistant.addContextIssue`. The catalogs use
different nouns for an issue inside some labels (for example `de` "Problem",
`it` "Fascicolo" for the Numo context menu entry and `pt-BR` "tickets"); the
articles quote those labels exactly and keep each article's established noun
in the surrounding prose.

## Figures

No figure was recaptured or added. `work-search` shows an identifier search,
which text search still answers first. `work-dependencies` shows a relation
search by identifier, which is unchanged. No figure shows a descriptive query.
Figure revisions were advanced with their articles without a content change.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` were run after the edits;
results are listed in the pull request.
