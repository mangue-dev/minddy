# Live description collaboration

MIN-728. Several people, Numo and MCP-connected agents edit the same issue or
objective description at the same time, with named colored carets. This
document is the contract between the browser session, the HTTP route, the
server authority and the database. It reuses the page protocol of
[live page collaboration](page-collaboration.md) and only describes what
differs. The editor engine shared by every text surface is
`components/editor/rich-editor.tsx`.

## Model

A description is one step stream, the `body` stream of the page protocol: the
same batches, limits, refusals, catch-up pages, rebasing client
(`CollabStream`) and caret channel. There is no title stream.

| What | Where |
| --- | --- |
| The document at the stream head | `rich_documents.content` (sealed in `encrypted_content` when protected), `revision` |
| The Markdown every other reader uses | `issues.description`, `objectives.description` |
| Which revision that Markdown reflects | `rich_documents.materialized_revision`, with `materialized_hash`, a keyed fingerprint of that Markdown |
| Accepted steps | `rich_document_batches`, sealed with the project key when the document is protected |

External readers (forge sync, MCP, Numo, notifications, webhooks, search,
exports) keep reading the parent's Markdown. The document only adds what
Markdown cannot carry: block identities, colors, mention pills.

| Module | Role |
| --- | --- |
| `lib/description-collaboration.ts` | Snapshot and catch-up wire shapes, caret topic names |
| `lib/use-description-collaboration.ts` | The browser session: one stream, wake-ups, carets, unload guard |
| `lib/document-collaboration-signals.ts` | Head wake-ups from the realtime bridge |
| `lib/server/description-collaboration.ts` | The authority: access, snapshots, batches, server edits, external writes, materialization |
| `lib/server/rich-documents.ts` | Storage: heads, commits, journal, sealing; the only module allowed to touch the tables |
| `app/api/documents/[kind]/[id]/collaboration/route.ts` | `GET` snapshot or catch-up (`?since=`), `POST` batch |
| `supabase/migrations/20270109200062_rich_documents.sql` | The document table and its encryption guard |
| `supabase/migrations/20270109200063_description_collaboration.sql` | Stream columns, journal, commit RPC, head wake-ups, caret topics |
| `supabase/migrations/20270109200064_description_materialization_claim.sql` | One materialization at a time |

## The authority

Unlike pages, descriptions are short, so every batch is applied by the server
and committed with the new head in one statement (`commit_rich_document`,
under a row lock and the revision CAS). There is no journal-only append and no
deferred document write; only the parent's Markdown is deferred.

A batch is accepted only when its base is the head, every step applies, the
result is a valid description document (no page-tree block such as a
subpage, the page input gate's checks unchanged), and its Markdown fits the
65,536-character description limit. The receipt (`batch_id`) is looked up
first, so a retry whose answer was lost is acknowledged again. Access is
decided afresh on every request (`hasProjectAccess`); there are no
collaboration tokens. The author is always the authenticated account.

A description's stream is created on its first snapshot, from the document
its Markdown reads as, or by a creation dialog with the document it edited.

### Writers outside a session

Every description write reaches live editors as steps:

- `updateIssueFields` and `updateObjective` call `syncDescriptionWrite` after
  their update. A PATCH from an editor passes its document; other writers
  (Numo, MCP, dictation, an older tab) pass Markdown, which is reconciled with
  the head block by block (`reconcileBodyBlocks`). The steps are computed once
  against the head that was read and, when typing landed meanwhile, rebased
  over the accepted steps (`rebaseCollabSteps`), never recomputed from the new
  head: that would revert typing in blocks the writer's text still shows as
  before.
- `minddy_edit_issue_text` (MCP) and Numo's `edit_issue_text` first write any
  pending typing into the Markdown (`materializePendingDescription`), so the
  agent edits the text people see.
- A writer that bypasses both (the forge sync) is noticed through
  `materialized_hash`: the next snapshot, catch-up or batch folds that
  Markdown into the head, the same way, but only while nothing is pending.
  With typing pending, the materialization folds it first, under its claim.

A whole-description replacement written from an older read remains a
replacement: typing that was not materialized when the writer read the text
is lost in the blocks the writer rewrote.

## Materialization

The instance that accepted a batch writes the head's Markdown after 2 s
without a newer batch on that instance (`scheduleMaterialization`). The
every-minute `/api/cron/page-materialization` job also materializes
descriptions whose typing has waited more than 15 s, 50 per run.

A materializer claims the document first
(`claim_rich_document_materialization`, 30 s): batches of one session can be
accepted by different instances, and two concurrent materializations would
each read the other's fresh Markdown as a foreign write. Under the claim it
folds a foreign Markdown in, then writes the head's Markdown through the
ordinary writer (`updateIssueFields` or `updateObjective` with
`descriptionFromDocument`), signed by the account that typed it, so
mentions, page links, activity, webhooks and the issue index follow as for
any edit. It then records the revision and fingerprint and releases the
claim. Presentation-only batches (mention pills rebuilt from text) are not
signed and write no Markdown.

## Wake-ups and carets

Each head move broadcasts a content-free `rich_document_heads` event on the
project topic (kind, document, revision). The realtime bridge hands it to the
session, which reads the missing steps over HTTP; the session also catches up
on `online`, `focus`, `pageshow`, visibility and every 45 seconds while an
editor is attached.

Carets travel as client Broadcast on the private `issue-collaboration:<id>`
and `objective-collaboration:<id>` topics. The database binds them to the
parent's project membership generation and only lets members of that project
send or receive, while the parent is not trashed; the channel behavior is the
page caret channel's (`lib/page-collaboration-presence.ts`).

## Surfaces

The issue panel (every issue view uses it), the triage page and the objective
page open a live session. Opening is kept short:

- the snapshot reads the head alongside the access decision, and a batch
  looks up its receipt alongside it;
- an issue card starts reading the snapshot on mouse-down, before the click
  opens the panel (`prefetchDescriptionSnapshot`, used once within 10 s);
- the browser keeps the last 16 sessions: reopening a description reuses its
  stream, paints the text it already holds, and catches up when its editor
  attaches. A session another surface is editing is never shared. While it loads they show the description formatted, read-only, in the
same editor, which builds its document during its first render (no raw
Markdown frame); when
it is unavailable (an older server, a failed read) they fall back to saving
Markdown with the editor document. Creation dialogs, comments and the
notebook do not collaborate. Version history stays a page feature.

## Encryption

Documents and batches are sealed under the parent's project key when content
encryption is on or the parent row is encrypted, and the database refuses a
clear document or clear steps under an encrypted parent or document. Clear
documents whose parent was encrypted later are deleted by the encryption
maintenance cron (`purge_clear_rich_documents`); their batches go with them,
and the next reader rebuilds the document from the Markdown. See
[the encryption inventory](security/encryption/README.md).

## Tests

- `lib/server/description-collaboration.test.ts`: batches on the head,
  catch-up and rebase of two sessions, retries, refusals, agent writes rebased
  over concurrent typing, external writes, materialization and its claim.
- `lib/server/rich-documents-route.test.ts`: description routes derive the
  Markdown on the server and hand the document to the writers.
- `components/editor/document-editor.test.tsx`, `lib/editor-block-sets.test.ts`,
  `lib/rich-document-reconcile.test.ts`: the editor, block sets and
  reconciliation.

A two-member browser session (convergence, carets, a live Numo edit) and a
forge round trip on the disposable repository were not run for this change.

## Images

Descriptions (live or not), the creation dialogs and the notebook accept
images: pasted, dropped where they should go, or inserted with “/”. They are
uploaded through the private attachment door (`/api/attachments/upload`) under
the surface's scope, `projects/<projectId>` or the account's own
`chat/<userId>` for the notebook, and the image block stores the
access-checked read route (`/api/attachments/file?path=…`) as its `src`, which
is also what the Markdown projection shows. Other files stay a page feature:
these editors leave them to the surface, which attaches them as resources
where it can (`components/editor/document-uploads.ts`,
`useEditorUploads` in `components/pages/page-uploads.tsx`). Unlike page
files, images removed from a description are not swept from storage.
