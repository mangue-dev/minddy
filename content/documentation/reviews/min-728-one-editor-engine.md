# One editor engine review (MIN-728)

Date: 2026-10-18. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope

MIN-728 moves every rich text surface onto the page editor engine, stores the
editor's document next to the Markdown of issue and objective descriptions and
of the notebook, and makes issue and objective descriptions live: several
people, Numo and connected agents edit them together, as on pages. Markdown
remains what Numo, connected agents, the forge and exports read; for live
descriptions it follows a couple of seconds after typing stops. Comments, the
creation dialogs and the notebook do not collaborate live, and version history
stays a page feature.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `issues`, revision 16: one paragraph at the end of `create-an-issue`. The
  description, comments and the new-issue dialog use the page editor without
  block handles; `/` inserts blocks and `@` mentions; several people edit a
  description at once with named carets, agent changes appear as they are
  saved, and the Markdown read by Numo, agents and CSV exports follows a few
  seconds after typing stops.
- `objectives`, revision 11: two sentences in `objectives` on the objective
  description and its comments, and on live editing of the description.
- `task-notebook`, revision 5: one paragraph in
  `task-notebook`. The notebook uses the page editor with its block handles,
  `/` offers the block catalog and **Dictate a task**, and storage stays
  Markdown with the same task states.

- `issues`, revision 16, `implementation-plans` and `plan-progress`: the plan
  is edited in place like the description, with a placeholder when empty and
  without an edit mode or save control; several members, Numo and agents edit
  it live; a task is added with `- [ ]` or **Task list** in `/`
  (`Pages.blockTaskList`), nested with Tab and Shift+Tab, completed with its
  box or set through its menu; the stored Markdown keeps the plan format. The
  concurrent-edit advice now says other edits appear live and that a
  whole-plan replacement still replaces what it rewrites.

Knowledge (English only): `core-tracker` gains one paragraph on the shared
editor; `plans-and-agents` says the plan is edited in place, live.

`scheduled-routines` was reviewed for the routine instruction moving to the
shared editor: the article does not describe the field's mechanics, and what
it says (write the instruction, mention issues, pages or objectives) stays
accurate, so it is unchanged. The pull request diff remark without a pull
request (an agent session's diff) moves to the shared editor without any
documented behavior change.

No figure changed: the existing new-issue, objective and notebook captures
show the same surfaces without block handles, and their content is unchanged.

Pending: `implementation-plans-steps` (`work-implementation-plan.png`, six
locales) still shows the former Plan tab, with its edit control and the
full-width prompt button. The tasks, states and progress it shows are
unchanged, but the figure must be recaptured with
`captures/shots/documentation-work` before publication; this review did not
run the capture pipeline, which writes the demo world on the production base.

## Sources checked

- `components/editor/rich-editor.tsx`: the shared engine; `blocks`,
  `blockChrome`, `bottomReserve`, `size`, `slashActions`, `extensions` and
  `nodeExtensions` options; the gutter (`BlockGutter`) mounts only with
  `blockChrome`.
- `components/pages/blocks/index.ts` and `types.ts`: `blocksIn("document")`
  excludes the subpage block; `slashItems({ uploads: false })` leaves image and
  file out of the `/` menu.
- `components/editor/document-editor.tsx`: Markdown in and out, `document`
  block set, no block chrome; descriptions, the issue and objective dialogs,
  triage, feedback and the pull request comment composer.
- `components/editor/comment-editor.tsx`: comment composer, reply, edit and
  triage message; `@Numo` offered where the old field offered it.
- `components/scratchpad/scratchpad-editor.tsx`: the notebook on the engine,
  with block chrome (`blockChrome`, no block link: `blockLinks={false}`), with
  its paragraph (deliberate empty lines), section copy, Markdown paste and the
  **Dictate a task** action.
- UI labels from `messages/*.json`: `Pages.blockCallout`, `Pages.blockDetails`,
  `Scratchpad.slashDictate`.
- `lib/server/description-collaboration.ts`, `lib/use-description-collaboration.ts`
  and `docs/document-collaboration.md`: live descriptions; the issue panel,
  the triage page and the objective page open a session; Markdown is
  materialized after 2 s of rest (the every-minute materialization job is the
  safety net); Numo and MCP description writes reach open editors as steps.
- Tests: `components/editor/document-editor.test.tsx`,
  `lib/editor-block-sets.test.ts` (notebook Markdown round trip, block sets),
  `lib/server/description-collaboration.test.ts` (two sessions converge, an
  agent edit is rebased over concurrent typing).

- Plans: `components/issue-plan.tsx` (live editor, placeholder
  `Plan.placeholder`, read-only `Plan.emptyTitle`, progress from the text on
  screen), `lib/server/description-collaboration.ts` and
  `lib/server/rich-documents.ts` (`plan` kind, `documentIdOf`),
  `lib/server/update-issue.ts` (plan writes reach live editors),
  `supabase/migrations/20270109200065_issue_plan_documents.sql`,
  `components/scratchpad/task-markdown.ts` (a list mixing bullets and tasks no
  longer gains an empty task). Tests: `lib/server/description-collaboration.test.ts`
  (plans), `lib/editor-block-sets.test.ts` (plan round trip, mixed lists).
- Routine instruction: `components/editor/prompt-editor.tsx`,
  `lib/prompt-document.ts`, `components/editor/prompt-skill-node.tsx` and
  `components/routines/routine-prompt-field.tsx`: plain text, mention
  identities with occurrences and `/name` skills as before; tests
  `lib/prompt-document.test.ts`, `components/editor/prompt-editor.test.tsx`.
- Pull request diff remarks: `components/pull-requests/pr-review-comments.tsx`;
  in a pull request they already used the shared composer.

No two-member browser session or forge round trip was run for this review.
