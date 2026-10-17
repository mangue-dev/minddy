# Live page collaboration

MIN-688. Several people, Numo and MCP-connected agents edit the same page at
the same time, including the same paragraph and the title, with colored named
carets. This document is the contract between the browser session, the HTTP
route, the server authority and the database. User-facing behavior is in the
[Pages guide](../content/documentation/en/pages.md#editor-save).

## Model

Each page has two independent step streams:

| Stream | Document | Head |
| --- | --- | --- |
| `body` | the ProseMirror document of `pageExtensions()` | `page_collaboration_heads` row `(page, 'body')` |
| `title` | a text-only document (`doc: text*`); positions are UTF-16 offsets, like a textarea | `page_collaboration_heads` row `(page, 'title')` |

A revision is the number of ProseMirror steps the stream has accepted. It is
not `pages.version` (one increment per accepted authored body write, still the
snapshot CAS of older clients) and not `pages.content_revision` (one increment
per row update, the CAS of the shared encrypted envelope).

The stream HEAD lives in `page_collaboration_heads`, the authority. The page
row holds the MATERIALIZED projection: `pages.body_revision` and
`pages.title_revision` say which revision its `content`/`title` (or sealed
envelope) reflects, and they change in the same row update as the
projection. Steps between the materialized revision and the head are
PENDING in the journal. A typing batch only journals its steps and advances
the head; the row is rewritten once per burst of typing by a materialization
(see [Materialization](#materialization)). Every reader sees the projection
plus the pending steps (see [Readers](#readers)), so the page is always read
at its head.

Clients follow the [`prosemirror-collab`](https://github.com/ProseMirror/prosemirror-collab)
contract. They apply their own transactions immediately, send unconfirmed
steps with the revision they are based on, receive accepted steps in revision
order with the client ID of each, and rebase what is still unconfirmed.

| Module | Role |
| --- | --- |
| `lib/page-collaboration.ts` | Wire types, limits, request validation, journal assembly |
| `lib/page-collaboration-document.ts` | Schemas, step application, minimal diffs, canonical initialization (also exported by the `.pages-md` bundle) |
| `lib/page-collaboration-origin.ts` | Transaction origin markers (remote, rebuild) |
| `lib/page-collaboration-stream.ts` | `CollabStream`: one field's client protocol, without React or DOM |
| `lib/use-page-collaboration.ts` | The page surface's session: both streams, title binding, wake-ups, carets |
| `components/pages/page-collaboration.ts` | Tiptap extension: collab plugin and caret decorations |
| `lib/server/page-collaboration.ts` | Journal, heads and the append, commit and materialize RPCs |
| `lib/server/page-collaboration-token.ts` | Collaboration tokens: issue, verify, access decision |
| `lib/server/page-collaboration-cache.ts` | This instance's last accepted stream values |
| `lib/server/pages.ts` (`submitPageCollaboration`, `commitPageStreams`, `materializePage`, `liveFromRow`) | The authority: validation, projection, materialization, side effects, live reads |
| `app/api/projects/[id]/pages/[pageId]/collaboration/route.ts` | `GET` snapshot or catch-up, `POST` batch |
| `app/api/cron/page-materialization/route.ts` | Materialization safety net, every minute |
| `supabase/migrations/20270109200054_page_collaboration.sql` | Journal, guards, caret topic |
| `supabase/migrations/20270109200057_page_collaboration_heads.sql` | Heads, append, materialize, commit, gaps |
| `supabase/migrations/20270109200058_page_collaboration_grant.sql` | Consistent access and generation read for tokens |

## Protocol

`GET …/collaboration` returns a snapshot of both streams at their heads.
`GET …/collaboration?field=body&since=N` returns the accepted steps after `N`
(at most 2,000 per answer; `to < head` means read again), or
`{ kind: "reset", reason, snapshot }` when the journal cannot bridge `N`.

`POST …/collaboration` sends one batch:
`{ field, base, batchId, clientId, steps, presentation? }`, at most 400 steps
and 400,000 serialized characters, validated before any step is parsed.
Answers: `accepted` (200), `behind` with the head (409: catch up, rebase, send
a new batch), `refused` with a reason (422: definitive for those steps).

The client keeps one batch in flight. It sends 50 ms after a keystroke, and
never two batches less than 250 ms apart, which bounds a fast typist at four
requests per second whatever the server's round trip. A batch whose response
is lost may have
been accepted. The server looks up its receipt (`batchId`) before comparing
revisions, so an identical retry is acknowledged again. The client does not
need that path: its next catch-up returns its own steps under its client ID,
and `receiveTransaction` drops them from the unconfirmed set instead of
applying them twice. Only then is anything resent, with a new batch ID.

Every request authenticates through `getAuthedUser()` (live session, MFA
level, same origin). Reads decide project access afresh. A batch needs write
access, which its collaboration token stands for (see
[Collaboration tokens](#collaboration-tokens)), and the author is always the
authenticated account. Every answer may carry a renewed token in the
`x-minddy-collab-token` header; the client keeps the latest per page
(`lib/pages-api.ts`) and sends it with each batch.

## The authority

The authority validates a batch against the stream's value at its base, then
accepts it only when:

- every step deserializes against the schema and applies;
- the result passes `Node.check()` and still has a block;
- the body passes `readPageContent()` unchanged. A step that the input gate
  would normalize (a refused link protocol, for instance) is refused, because
  replaying the journal must reproduce the stored page exactly;
- the title stays within 500 characters.

A session's batch is APPENDED (`submitPageCollaboration`,
`append_page_collaboration`). The value at the base comes from this
instance's cache of accepted values (`page-collaboration-cache.ts`) when it
holds that exact revision, which is usual for a typist's next batch; otherwise
from the row plus its pending steps. A value is a function of (page, field,
revision): every writer that changes the body or the title advances the
revision, so a cached value can only be behind, never wrong, and the head
comparison below catches it. The batch is sealed and appended in one
transaction:

1. a KEY SHARE lock on the page row (SHARE for a plaintext batch, which must
   not race the page being sealed), and the page's project and liveness;
2. the project membership generation compared to the token's (`revoked`);
3. the head rows locked, `body` before `title`;
4. receipt lookup (`duplicate`, `batch_reused`);
5. heads compared to each batch's base (`behind`);
6. batch journaled, head advanced, `pending_since` set if it was empty.

The page row is not written, and the KEY SHARE lock does not wait for a
materialization or a metadata write (NO KEY UPDATE). The answer reports the
steps now pending and the age of the oldest, which decides when to
materialize. Lock order everywhere: the page row, then its head rows.

Whole-document writers COMMIT through the authority:
`commit_page_collaboration` journals their steps and writes the projection at
the new heads in one transaction, under the page row lock. `updatePage` (an
older tab's PATCH, a whole-body Numo or MCP replacement, a restored version),
the subpage mirror `syncParentBody` and the canonical initialization express
their value as steps against the live document (`diffDocSteps`), the way a
person would make them:

- unchanged blocks are matched exactly (longest common subsequence) and left
  alone;
- a changed block of the same type and attributes is edited in place,
  recursively through lists, quotes and toggles, down to word-sized units
  inside a text block;
- only blocks without a counterpart are inserted or removed.

Two separate corrections are therefore two small steps, and text a
collaborator typed between them is part of neither. The result is verified
against the target, with a single replaced range as the fallback. Connected
editors receive these steps live. A version-guarded PATCH still fails with `pageStale` when the body
moved since its base. An unguarded replacement is recomputed on each attempt,
which is an explicit replacement.

Numo and MCP targeted edits (`append_to_page`, `edit_page_text`) behave like a
second person typing (`editPageBodyLive`):

1. They derive their Markdown from the body as read and reconcile the reparsed
   body with it block by block (`reconcileBodyBlocks`). Every top-level block
   whose Markdown did not change is kept as stored, with its block ID, mention
   nodes and presentation attributes. A rewritten block keeps the ID of the
   block it replaces, so the diff edits it in place.
2. The difference becomes steps against the revision that was read.
3. When people typed meanwhile, those steps are rebased onto the steps
   accepted since (`rebaseDocSteps`, the algorithm of `prosemirror-collab`).
   There is no version check: text a collaborator types, even inside the same
   sentence, is merged like a parallel edit's, never replaced.

Only when the journal cannot bridge the gap is the edit derived again from the
current text, where it fails when `old_string` no longer matches or matches
ambiguously. A whole-body `update_page` remains an explicit replacement guarded
by the version it read. A changed block's new text has the losses listed in
`lib/pages-markdown.ts`.

### Side effects

Search text, links, history snapshots, activity, mention notifications and
routine events follow an accepted write, and the structural tests
`pages-history-paths`, `pages-search-paths` and `page-links-paths` enforce it.
A commit (whole-document writer, agent edit) runs them at once
(`afterStreamCommit`), as before: a change of author, an agent write and a
replacement are never coalesced.

Appended typing runs them when it is materialized
(`materializationEffects`), once per materialization instead of once per
batch:

- search text and links are reprojected once;
- the stored state is archived as covered by the first author of the pending
  batches, with the usual coalescing (`stampPageWrite`): one author typing
  continuously keeps one history line per five minutes, and a different
  author always gets one. Intermediate states inside one materialization (a
  few seconds of typing) are not archived separately;
- each author's activity line is recorded once, unless they continue the
  stored write (same author, less than a minute ago);
- new mentions are announced per run of one author's batches, each attributed
  to whoever typed it; beyond 64 alternations in one materialization, later
  runs are not scanned (logged as `materialization mention scan truncated`);
- routine events follow the row update.

A commit that includes pending typing in the projection it writes (a sealed
page's envelope carries both streams) runs those batches' effects the same
way. These effects use `afterOrNow`, as before MIN-688: they are best-effort
and not a durable outbox. A process that dies after a materialization loses
its effects, but not the materialization. The next projection catches the
search text and links up. A lost history snapshot is not recreated.

### Initialization and presentation

The `Document` node requires a block, while older pages store
`{ type: "doc", content: [] }`, and blocks may lack IDs. `createPage` now
stores the canonical form (`canonicalBodyJSON`). The first snapshot of an older
page commits that form once, under CAS, before any client receives a revision.
This avoids each editor filling the gap with a random block ID. Initialization
does not sign the page or count as a body version, so a reader's first visit
can also perform it.

Rebuilding mention pills from text that agents wrote (`hydrateMentions`)
changes nodes, so a live editor sends it as a `presentation` batch. The
authority accepts it only when the page's Markdown projection is unchanged,
and records it without signing the page. Only a writer with nothing else
pending sends one, and a live editor rebuilds only the pills whose label reads
exactly like the text they replace: `@numo` would become a pill labeled
`Numo`, a change of text, so it stays text. After any refusal, the session
stops sending rebuilds. A reader's editor does not rebuild pills, so its document
never drifts from the stream.

## Materialization

`materializePage` reads the row and its pending steps, applies them, re-seals
the envelope once and writes it with `materialize_page_collaboration`, under
the envelope CAS (`content_revision`): a concurrent envelope writer (a
database cell, another materialization) makes it read again, up to four
times. The function also checks that the revisions it materializes lie
between the row's and the heads, clears `pending_since` when nothing remains
pending (or moves it to the first remaining step), and prunes the journal
below the materialized revision (last 2,000 revisions, seven days).

Version and author: the row's `version` advances by one per authored body
batch it now includes, and `updated_by`, `updated_kind` and
`updated_api_key_id` become those of the last authored batch, exactly what the
per-batch rewrites produced. Presentation and initialization batches are not
authored (`page_collaboration_batches.authored = false`).

When it runs:

| Trigger | Delay |
| --- | --- |
| The instance that accepted a batch (`scheduleMaterialization`, through `afterOrNow`) | after 2 s without a newer batch on that instance |
| A batch leaving 400 or more steps pending, or the oldest pending step 10 s old | at once, unless one is running on that instance |
| A reader that needs the row itself ([Readers](#readers)) | before its read |
| `/api/cron/page-materialization`, every minute (Vercel and the self-hosted scheduler) | pending steps older than 15 s, 50 pages per run |

Instances do not coordinate: two materializations of one page race on the
envelope CAS and the loser finds nothing left. Continuous typing therefore
rewrites the row at most every ten seconds, and the cron bounds the lag at
about 75 s when the accepting instance dies before its timer.

If the journal cannot bridge the materialized revision and the head (it
should never happen: pending rows are never pruned), the materializer opens a
gap (`reset_page_collaboration`) and connected editors reset to the stored
page.

## Readers

Every reader of a page's body or title sees the head: either it applies the
pending steps to the stored projection (`liveFromRow`: one row read with the
heads embedded, then the pending journal, decrypted after access is
established), or it materializes the page first and reads the row
(`materializePendingPages`, one indexed read when nothing is pending). Readers
that only label something with a title accept the materialization lag.
Writers that re-seal a row's envelope must start from the STORED page
(`loadStoredPage`, `getStoredPage`): sealing the live text under the stored
revision would replay pending steps twice at the next materialization.

| Reader | Reads | Choice |
| --- | --- | --- |
| `getPage`, `loadPage` (page `GET`, PATCH answers, database reads, `database-import`, the Numo and MCP page tools of `lib/server/page-tools.ts`, page comment anchors) | body, title | Pending steps applied |
| `readPageCollaborationSnapshot`, catch-up resets, the authority's own reads | body, title | Pending steps applied, at the heads |
| `listPages` (sidebar, the page tools' page list) | title | Pending title steps applied (only pages with pending title steps read the journal) |
| `duplicatePage` | body, title | Materialized first |
| `exportPage` (Markdown, ZIP) | body, title | Materialized first (the project for a branch outline) |
| `buildAccountExport` | body, title | Materialized first, for every owned project |
| `getPublicShareTarget`, `getPublicPageBundle` (`/p/…`, `/share/…`) | body, title | Materialized first (the shown page and the branch) |
| `sweepOrphanPageFiles` | body | Materialized first: a file cited only by pending typing is not an orphan |
| History snapshots (`stampPageWrite`) | body, title | A commit archives the live state it replaces; a materialization archives the stored state it covers |
| Restore a version (`restorePageVersion` → `updatePage`) | body, title | Pending steps applied, then committed |
| Search projection (`syncPagesSearchText`, protected search cache) and page links | body | Run after each materialization or commit; lag at most one materialization |
| `search_pages`, `page_search_cipher_fingerprints` (SQL) | title, `search_text` | Projection lag, as above |
| `discard_blank_page_guarded` (SQL) | body, title | Refuses (`not_empty`) while steps are pending; head rows share locked after the page row |
| Database cell, schema and conversion writers (`page-databases.ts`, `page-database-conversion-protected.ts`, `commit_page_content_batch`) | envelope | Stored page: they re-seal it under the envelope CAS and never change body or title |
| `updatePage` metadata-only write (icon, pin, move) | envelope | Stored page, same reason |
| Title labels: inbox, push, app tabs, palette index, resource chips, backlinks, trash, Numo prompt context and comment agent, routine events, feedback board tabs | title | Projection lag (seconds; at most about 75 s if the accepting instance died) |
| `encryption/page-content-backfill.ts` | body, title | Stored page: re-sealing is content-preserving; pending steps stay valid on top |

## Collaboration tokens

A batch needs write access, but re-running the project access queries on
every batch cost a database round trip each time. The snapshot and every
catch-up decide access afresh and issue a token
(`lib/server/page-collaboration-token.ts`); a batch carrying a valid token
makes no access query.

A token is `c1.<claims>.<HMAC-SHA256>` over the account, page, project, the
write decision and the project's membership generation at that decision, with
an expiry 45 seconds later (`COLLAB_TOKEN_TTL_MS`). The key is derived by HKDF
from `MINDDY_DATA_ROOT_KEY`, or from the service role key where no root key is
configured. Verification is local. A token is refused when it is malformed,
forged, expired, issued for another account, page or project, or claims a
lifetime above 45 seconds.

The decision and the generation come from one statement
(`page_collaboration_grant`): read separately, a membership read before a
revocation could be paired with a generation read after it. The rules are
those of `hasProjectAccess`.

- Every request still authenticates the account live (`getAuthedUser`:
  session, MFA level, origin).
- `append_page_collaboration` compares the token's generation with the
  project's. Removing a member, changing a role or transferring ownership
  rotates it, so the next batch answers `revoked`; the server then decides
  again and refuses a revoked account (404, or 403 for a reader) or continues
  with a new token when the change concerned someone else.
- A change that does not rotate the generation, such as trashing the project,
  is honored within the token lifetime: **at most 45 seconds**.
- A batch whose token has less than 20 seconds left decides access alongside
  its work and returns a renewed token, so an active typist never pays a full
  access check in the critical path.

## Gaps and recovery

The `pages_b_collaboration_guard` trigger allows the materialized revisions to
move only inside the collaboration functions. Another writer that changes the
body (it raises `version`, or rewrites a plaintext body) or a plaintext title
opens a gap instead (`open_page_collaboration_gap`): the head advances one
past every accepted step without a journal row, and the row is declared to
reflect it. Steps still pending are discarded, because that writer started
from the stored projection. Database imports into an existing root call
`reset_page_collaboration` for the same reason, since their sealed root write
changes no counter. Writers inventoried for MIN-688:

| Writer | Path |
| --- | --- |
| Session typing | Steps appended, materialized later |
| `updatePage` with body or title, restore, Numo/MCP, legacy PATCH | Steps committed with the projection (authority) |
| `syncParentBody` (trash, discard, restore mirror) | Steps committed (authority) |
| Canonical initialization | Steps committed, unsigned |
| `createPage`, `duplicatePage` | New rows at revision 0, canonical, with head rows (`pages_initialize_collaboration_heads`) |
| `commit_page_content_batch`, database schema, cells and conversions | Content-preserving for body and title, from the stored page |
| Database import into an existing root | Gap (`reset_page_collaboration`) |
| Account import upsert, encryption backfill | Gap through the guard, or content-preserving |

A client whose revision is not covered (compacted journal, gap, a revision
ahead of the server) receives `reset` with a fresh snapshot. If it has no
pending steps, it adopts the snapshot. Otherwise it merges block by block
(`mergeDocs`) between its confirmed basis, its screen and the snapshot. The
result is re-expressed as new local steps, and contested blocks appear in the
conflict banner. The title keeps local text over a concurrent replacement.

When Activity hides a page or Tiptap recreates its editor, the stream moves
onto its own headless state, the confirmed document plus the same pending
steps, and keeps sending them. The next editor is rebased onto that state,
read-only while a batch from its predecessor is still in flight. Pending
steps therefore survive hiding, eviction from the retained documents and
navigation for as long as the app stays open. They do not survive a reload or
closing the app: `pagehide` sends the next batch with `keepalive`, which is
not an acknowledgement, and `beforeunload` warns while work is pending. Undo
history does not survive an editor recreation.

A refused batch is reverted on the screen and reported (`liveEditRefused`).
A fatal answer (401, 403, 404, for example a revoked member) stops sending and
leaves the work pending and visible as a save error.

## Wake-ups and carets

No document travels through Realtime. Each move of a stream head broadcasts a
content-free event on the project topic
(`page_collaboration_heads`: page, field, revision; about 150 bytes, against
the page row before). The realtime bridge hands it to the session
(`lib/page-collaboration-signals.ts`), which reads the missing steps over
HTTP. Gaps and resets move heads too, so they announce themselves the same
way. The session also catches up when it attaches, on `online`, `focus`,
`pageshow` and when the tab becomes visible, and every 45 seconds while an
editor is attached and its tab visible, so a lost wake-up cannot leave a peer
stale.

For a page in a live session, the bridge does not refetch the whole document
on a head event; a page open without one refetches it. A body head event
never reloads the project's page list, and neither does a row update that
only advanced the materialized body. A title head event, trash, restore and
title changes still do.

Carets travel as client Broadcast on the private `page-collaboration:<pageId>`
topic, not as Presence: Supabase allows a client five Presence updates per
30 seconds and closes the channel beyond that, which a moving caret reaches
within a second (verified: the channel closed with "Client presence rate limit
exceeded"). The database binds the topic to the page's project membership
generation and only lets members send or receive Broadcast on it, so a revoked
member is rekeyed out and the topic stops resolving once the page is trashed.
A caret carries `{ userId, sessionId, seq, caret: { field, revision, anchor,
head } }`, in the coordinates of the last confirmed revision without the
publisher's pending steps; `caret: null` withdraws it. Receivers map it onto
their screen through the confirmed step maps they keep (1,000 steps), or hide
it when it cannot be placed. Broadcast keeps no state, so the channel module
adds it back:

- publications are throttled to one per 250 ms;
- a focused editor re-sends its caret every 4 s, and a caret not heard from for
  10 s is dropped, so a crashed tab disappears on its own;
- a blurred or closed editor withdraws its caret at once;
- a session that joins sends a `hello`, answered by every focused peer;
- a closed or failed channel rejoins with backoff.

`seq` grows with the clock, so it stays monotonic for a session ID across
channel handles (a remount, React's double effects in development).

Trust: as with `page-presence`, the user ID in a caret is the publisher's
claim. Only members of the page's project can publish or receive. Names and
colors are resolved from the member list, never from the payload. A member
could draw a caret under another member's name; carets are advisory and
carry no content.

The title draws peers' carets as an overlay measured in a mirror element.
Selections are drawn in the body only.

## Storage, encryption and retention

`page_collaboration_batches` (service role only, RLS without policies) stores
one row per accepted batch: `page_id`, `field`, `base_revision`, `step_count`,
`batch_id`, `client_id`, author, `authored`, and either plaintext `steps`
(legacy plaintext pages only) or `encrypted_content` sealed with the project
content key through `EncryptedRowCodec` (`steps` is classified as encrypted in
`data-policy.json`). Steps can contain deleted text, so:

- the append and the commit refuse a plaintext batch for a sealed page, and a
  plaintext append holds a share lock on the page row so that the page cannot
  be sealed underneath it;
- `guard_page_collaboration_batch` refuses plaintext once page protection is
  active or the page is sealed, and shares the page content marker fence;
- the page guard deletes a page's plaintext rows when the page becomes sealed;
- `scripts/check-encrypted-column-access.mjs` restricts journal access, and the
  append, commit, materialize and reset RPCs, to
  `lib/server/page-collaboration.ts`.

Pending steps change nothing to that: they stay sealed in the journal until a
materialization re-seals the page envelope. Decrypted values live only in the
memory of the instance that validated a batch (`page-collaboration-cache.ts`,
at most 128 streams, one minute idle), never in a log, a client store or the
token.

`page_collaboration_heads` (RLS without policies; the service role may only
read it, every write goes through the functions above) holds one row per page
and stream: `revision`, `project_id` and `pending_since`. It carries no
content. Rows are created with each page (`pages_initialize_collaboration_heads`,
and backfilled by the migration) and cascade with it.

Retention: a materialization or a commit prunes its page's journal to the last
2,000 revisions of each stream, for at most seven days, and never below the
materialized revision, so pending steps are never lost to retention. The
nightly retention sweep (`prune_page_collaboration_batches`) removes expired,
materialized rows of idle pages. A receipt lives as long as its row. Rows
cascade with page and project deletion. Key rotation adds key versions without
rewriting rows, which stay readable until they expire.

## Compatibility and enablement

Migrations `20270109200057` and `20270109200058` replace
`commit_page_collaboration` (new signature) and are applied before this
application version is deployed; no deployed version calls the old one. The
deployed release writes pages directly: its body writes open gaps through the
guard, as before, and its page inserts receive head rows from the trigger.
Older browser tabs keep the snapshot PATCH, which the server routes through
the authority, so live editors see their edits. The new client falls back to
snapshot saving when its session cannot start. A client without a token
simply makes the server decide access on its batch. The protocol version
`PAGE_COLLABORATION_PROTOCOL` is carried by every snapshot and is unchanged.

## Verification

- `lib/page-collaboration-stream.test.ts`: two and three collaborators against
  an in-memory authority, covering same-paragraph typing, interleaved deletion,
  a lost response, a reset with pending work, undo after a remote edit,
  refusal, a fatal error, a destroyed and recreated editor, title merging and
  caret mapping; against a journal-only authority, a session joining while
  typing is pending and convergence across materializations.
- `lib/server/pages.test.ts`: an appended batch leaves the row untouched and
  its materialization signs it once; `behind` from the cache and from the
  row; receipt retry; content-gate, presentation and reader refusals;
  initialization; catch-up and reset; minimal replacement; the title stream
  and the list's pending title; readers, snapshots and duplication with
  pending steps; discard refused while typing is pending; several batches
  materialized with one envelope write, one history line and one activity
  line; mentions attributed per author; a replacement that materializes the
  typing it includes; the cron safety net.
- `lib/server/pages.test.ts` (collaboration tokens): no access query on a
  valid token; a fresh decision for a missing, expired, foreign, forged or
  over-long token; a revoked member refused at the next batch; a generation
  moved by someone else's membership change; a reader refused from the token
  alone.
- `lib/page-collaboration-document.test.ts`: word-sized steps for separate
  corrections, in-place edits in nested lists, block insertion, removal and
  reordering, and rebasing an agent's steps onto a person's typing in the same
  sentence and in another block.
- `lib/server/mcp/page-tools.test.ts`: untouched blocks keep IDs and colors,
  and an edit survives a concurrent write.
- `lib/server/pages.test.ts` (live agent edit): a person's batch appended while
  the agent derives its edit is kept, and the agent's batch is rebased after it.
- `lib/realtime-keys.test.ts`: invalidation fan-out and head-event routing.
- `lib/server/pages-export.test.ts`, `lib/server/page-files.test.ts`: readers
  that need the row materialize pending typing first.
- `lib/server/page-materialization-cron.test.ts`: the safety net requires the
  cron secret and is scheduled every minute on Vercel and self-hosted.
- Migrations `20270109200057` and `20270109200058` ran against the production
  schema inside rollback-only statements before being applied: heads backfill
  and creation, append (accepted, page row untouched, head broadcast,
  duplicate, `behind`, `revoked`, `missing`, plaintext title), materialize
  (envelope CAS, revision bounds, write, `unchanged`), commit, guard gap,
  immutable revisions, reset, discard refused while pending, cascade,
  retention, privileges, and the grant for owner, member, reader, stranger and
  a rotated generation.

## Performance

Measured on 2026-10-17 against the production database with disposable data
(the full report is the measurement session's, not committed):

- Edit-to-peer latency was about 1 s at the median with the functions in
  `iad1` (Washington) and the database in `eu-west-1`, at about 120 ms per
  database round trip. The functions now run in `dub1` (`vercel.json`), about
  17 ms from the database.
- A batch made six sequential database round trips and a catch-up four. A
  batch with a valid collaboration token and a cached base now makes three
  (authentication; the current journal key; the append), and a catch-up two
  (authentication; access decision, stream head and journal in parallel).
  Without a cached base, the row and its pending journal are read too. Rows
  are fetched while access is checked but decrypted only once it is
  confirmed, and a denial aborts the reads, as `listPages` does.
- Throughput was capped at about 35 to 185 page commits per second for the
  whole application, because every page write took two global advisory locks
  in exclusive mode (`page-content-activation` in `guard_page_content`, and
  the `encryption-marker:page_content_encryption_scope` fence). Writers only
  need to be separated from encryption activation, not from each other:
  migration `20270109200055` makes writer-side fences shared, activation
  keeps them exclusive (see the
  [encryption inventory](security/encryption/README.md#shared-writer-fences-min-688)).
  Concurrent writes to different pages no longer wait for one another; writes
  to the same page still serialize on its row.

### Journal-only commits (scaling follow-up)

Every typing batch used to re-seal the whole page envelope and rewrite the
page row: about 200 ms per commit on a large page, up to 180 KB written each
time, and contention with database cells on the shared envelope CAS. Batches
now only journal their steps (see [The authority](#the-authority)). Measured
on 2026-10-17 from a Mac (about 55 ms from `eu-west-1`) against the
production database, with a disposable account, project and 32 large sealed
pages (300 paragraphs, a 138 KB envelope each), all deleted afterwards (key
registry rows included):

| Measure | Before (commit rewriting the page) | After (append) |
| --- | --- | --- |
| Commit RPC, 1 large page, back to back | ~200 ms (4.8/s) | p50 57 ms, p90 64 ms (8.4/s including sealing) |
| Commit RPC, 8 large pages in parallel | 31.6/s, p50 240 ms | 60.8/s, p50 62 ms |
| Commit RPC, 16 large pages in parallel | 49.8/s, p50 328 ms | 119.4/s, p50 64 ms |
| Commit RPC, 32 large pages in parallel | 60.9/s, p50 520 ms | 192.2/s, p50 81 ms, p90 113 ms |
| Bytes written per batch | the whole envelope (up to 180 KB) | the sealed batch (about 1 KB) |

At 32 pages the database ran its commits without waiting: the rate is bound
by this client's round trips (one sealing key read, one append per batch and
worker), not by the database. Through the server function
(`submitPageCollaboration`, token valid, base cached, materializations
running alongside in the same process):

- one typist on one large page: p50 116 ms, p90 136 ms per batch, two
  database requests (key registry, append) plus the route's authentication;
- 16 typists on 16 large pages: 115.8 batches/s, p50 126 ms, p90 158 ms;
- 32 typists: 168.1 batches/s, p50 167 ms, p90 244 ms (bound by this one
  Node process: validating a batch applies its steps to a 60 KB document);
- a batch on an instance that never saw the page, with 40 pending steps:
  333 ms and four requests (row, pending journal, key, append);
- `getPage` with pending steps: 198 ms and three requests (access, row with
  heads, pending journal);
- materializing 298 pending steps on a large page: 647 ms and five requests,
  once instead of 298 envelope writes.

A browser session with two members (headless Chromium against `npm run dev`,
disposable accounts in a disposable project, all deleted afterwards) typed into
the same paragraph at the same moment: both screens and the stored page
converged on the same text with no lost character, each screen showed the
other's named caret, still there after 3 s and after it moved, and a title
change reached the other screen live.

After the journal-only change, the same two-member browser session (headless
Chromium against `npm run dev` on this branch, disposable accounts and
project, deleted afterwards, key registry rows included) typed into the same
paragraph at once: both screens held the same text, the page row was still at
materialized revision 0 with the head at 30 just after typing and at 30 four
seconds later, and a reload showed the text. A reload while six steps were
still pending showed them, as did the page `GET`.

Not verified: desktop resume, member revocation during an open session in a
browser (the token and generation paths are unit-tested and probed in SQL),
and latency after the region change.
