# Live page collaboration

MIN-688. Several people, Numo and MCP-connected agents edit the same page at
the same time, including the same paragraph and the title, with colored named
carets. This document is the contract between the browser session, the HTTP
route, the server authority and the database. User-facing behavior is in the
[Pages guide](../content/documentation/en/pages.md#editor-save).

## Model

Each page has two independent step streams:

| Stream | Document | Revision column |
| --- | --- | --- |
| `body` | the ProseMirror document of `pageExtensions()` | `pages.body_revision` |
| `title` | a text-only document (`doc: text*`); positions are UTF-16 offsets, like a textarea | `pages.title_revision` |

A revision is the number of ProseMirror steps the stream has accepted. It is
not `pages.version` (one increment per accepted authored body write, still the
snapshot CAS of older clients) and not `pages.content_revision` (one increment
per row update, the CAS of the shared encrypted envelope). The page row stays
the canonical document for every other reader: exports, Markdown projection,
history, search, publication and agents.

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
| `lib/server/page-collaboration.ts` | Journal storage and the commit RPC |
| `lib/server/pages.ts` (`commitPageStreams`) | The authority: validation, projection, side effects |
| `app/api/projects/[id]/pages/[pageId]/collaboration/route.ts` | `GET` snapshot or catch-up, `POST` batch |
| `supabase/migrations/20270109200054_page_collaboration.sql` | Columns, journal, guards, RPCs, caret topic |

## Protocol

`GET …/collaboration` returns a snapshot of both streams from one row read.
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
level, same origin) and rechecks current project access. Reads need read
access. A batch needs write access, and the author is always the
authenticated account.

## The authority

`commitPageStreams` applies a batch to the decoded page, then accepts it only
when:

- every step deserializes against the schema and applies;
- the result passes `Node.check()` and still has a block;
- the body passes `readPageContent()` unchanged. A step that the input gate
  would normalize (a refused link protocol, for instance) is refused, because
  replaying the journal must reproduce the stored page exactly;
- the title stays within 500 characters.

`commit_page_collaboration` then runs in one transaction, under the page row
lock:

1. receipt lookup;
2. stream heads compared to each batch's base (`behind`);
3. the envelope token `content_revision` compared (`retry`: only the shared
   envelope moved, for example a database cell, and the server reapplies the
   same batch at once);
4. page projection written, heads advanced;
5. batch journaled.

A body, a title and an icon change from one request commit together; so do a
move or a pin sent with them.

Whole-document writers join the same path. `updatePage` (an older tab's PATCH,
a whole-body Numo or MCP replacement, a restored version), the subpage mirror
`syncParentBody` and the canonical initialization express their value as steps
against the current document (`diffDocSteps`), the way a person would make
them:

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
routine events follow an accepted batch (`afterStreamCommit`), and
the structural tests `pages-history-paths`, `pages-search-paths` and
`page-links-paths` enforce it. Typing batches coalesce:

- search and link projections run after two quiet seconds, with only the newest
  scheduled one on an instance running;
- a human batch that continues its author's write from the previous minute adds
  neither a history snapshot nor an activity line, but still notifies new
  mentions;
- a change of author, an agent write and a replacement are never coalesced.

These effects use `afterOrNow`, as before MIN-688: they are best-effort and
not a durable outbox. A process that dies after a commit loses the effects of
that batch, but not the batch itself. The next projection catches the search
text and links up. A lost history snapshot is not recreated.

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

## Gaps and recovery

The `pages_b_collaboration_guard` trigger allows revisions to move only inside
the commit and reset RPCs. Another writer that changes the body (it raises
`version`, or rewrites a plaintext body) or a plaintext title opens a gap
instead: the revision advances without a journal row. Database imports into an
existing root call `reset_page_collaboration` for the same reason, since their
sealed root write changes no counter. Writers inventoried for MIN-688:

| Writer | Path |
| --- | --- |
| `updatePage` with body or title, restore, Numo/MCP, legacy PATCH | Steps (authority) |
| `syncParentBody` (trash, discard, restore mirror) | Steps (authority) |
| Canonical initialization | Steps, unsigned |
| `createPage`, `duplicatePage` | New rows at revision 0, canonical |
| `commit_page_content_batch`, database schema, cells and conversions | Content-preserving for body and title |
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

No document travels through Realtime. Each commit updates the page row, and
the existing content-free `broadcast_page_row` sends the row with its stream
heads on the project topic. The realtime bridge hands them to the session
(`lib/page-collaboration-signals.ts`), which reads the missing steps over
HTTP. The session also catches up when it attaches, on `online`, `focus`,
`pageshow` and when the tab becomes visible, and every 45 seconds while an
editor is attached and its tab visible, so a lost wake-up cannot leave a peer
stale.

For a page in a live session, the bridge no longer refetches the whole
document on each batch. A batch that only advanced the body stream no longer
reloads the project's page list either. Trash, restore and title changes still
do.

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
`batch_id`, `client_id`, author, and either plaintext `steps` (legacy plaintext
pages only) or `encrypted_content` sealed with the project content key through
`EncryptedRowCodec` (`steps` is classified as encrypted in `data-policy.json`).
Steps can contain deleted text, so:

- the commit refuses a plaintext batch for a sealed page;
- `guard_page_collaboration_batch` refuses plaintext once page protection is
  active or the page is sealed, and shares the page content marker fence;
- the page guard deletes a page's plaintext rows when the page becomes sealed;
- `scripts/check-encrypted-column-access.mjs` restricts journal access to
  `lib/server/page-collaboration.ts`.

Retention: each commit keeps the last 2,000 revisions of its stream, for at
most seven days. The nightly retention sweep
(`prune_page_collaboration_batches`) removes expired rows of idle pages. A
receipt lives as long as its row. Rows cascade with page and project deletion.
Key rotation adds key versions without rewriting rows, which stay readable
until they expire.

## Compatibility and enablement

The migration is additive. Deployed code that writes pages directly keeps
working: its body writes open gaps, which live clients turn into resets.
Older browser tabs keep the snapshot PATCH, which the server now routes
through the authority, so live editors see their edits. The new client falls
back to snapshot saving when its session cannot start. Deployment order:
apply the migration, then deploy the application. The protocol version
`PAGE_COLLABORATION_PROTOCOL` is carried by every snapshot.

## Verification

- `lib/page-collaboration-stream.test.ts`: two and three collaborators against
  an in-memory authority, covering same-paragraph typing, interleaved deletion,
  a lost response, a reset with pending work, undo after a remote edit,
  refusal, a fatal error, a destroyed and recreated editor, title merging and
  caret mapping.
- `lib/server/pages.test.ts`: acceptance and signing, `behind`, receipt retry,
  content-gate refusal, presentation refusal, reader refusal, initialization,
  catch-up and reset, minimal replacement, and the title stream.
- `lib/page-collaboration-document.test.ts`: word-sized steps for separate
  corrections, in-place edits in nested lists, block insertion, removal and
  reordering, and rebasing an agent's steps onto a person's typing in the same
  sentence and in another block.
- `lib/server/mcp/page-tools.test.ts`: untouched blocks keep IDs and colors,
  and an edit survives a concurrent write.
- `lib/server/pages.test.ts` (live agent edit): a person's batch accepted while
  the agent derives its edit is kept, and the agent's batch is rebased after it.
- `lib/realtime-keys.test.ts`: invalidation fan-out and wake-up routing.
- The migration ran against the production schema inside a rollback-only
  transaction: accept, duplicate receipt, `behind`, `retry`, plaintext refusal
  on a sealed page, gap, immutable revisions, reset, topic resolution and
  aliases, policies, absence of client grants, cascade.

## Performance

Measured on 2026-10-17 against the production database with disposable data
(the full report is the measurement session's, not committed):

- Edit-to-peer latency was about 1 s at the median with the functions in
  `iad1` (Washington) and the database in `eu-west-1`, at about 120 ms per
  database round trip. The functions now run in `dub1` (`vercel.json`), about
  17 ms from the database.
- A batch made six sequential database round trips and a catch-up four. A
  batch now makes four (authentication; project access in parallel with the
  page read; both content key reads in parallel; the commit), and a catch-up
  two (authentication; access, stream head and journal in parallel). Rows are
  fetched while access is checked but decrypted only once it is confirmed,
  and a denial aborts the reads, as `listPages` does.
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

A browser session with two members (headless Chromium against `npm run dev`,
disposable accounts in a disposable project, all deleted afterwards) typed into
the same paragraph at the same moment: both screens and the stored page
converged on the same text with no lost character, each screen showed the
other's named caret, still there after 3 s and after it moved, and a title
change reached the other screen live.

Not verified: desktop resume, member revocation during an open session, and
latency after the region change.
