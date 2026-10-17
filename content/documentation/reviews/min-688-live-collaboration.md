# Live page collaboration review (MIN-688)

Date: 2026-10-17. Reviewer: `agent:/root`, with one translation agent per
locale (`agent:/root/min688_fr`, `_de`, `_es`, `_it`, `_pt-BR`). This is an
agent review of the source on the same branch, its unit tests and a
rollback-only probe of the migration against the production schema. It is not
human reader acceptance, a browser walkthrough with two members or a deployed
release test. Application and desktop versions are unchanged (0.11.1).

## Scope and sources

Authoritative contract: `docs/page-collaboration.md`. Supporting source:
`lib/page-collaboration.ts`, `lib/page-collaboration-document.ts`,
`lib/page-collaboration-stream.ts`, `lib/use-page-collaboration.ts`,
`lib/page-collaboration-presence.ts`, `components/pages/page-collaboration.ts`,
`components/pages/page-title-carets.tsx`, `lib/server/pages.ts`
(`commitPageStreams`, `submitPageCollaboration`,
`readPageCollaborationSnapshot`, `readPageCollaborationSteps`),
`lib/server/page-tools.ts`, `supabase/migrations/20270109200054_page_collaboration.sql`
and the new message `Pages.liveEditRefused`.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR` (one revision each):

- `pages`, sections `editor-save`, `page-comments-and-collaboration` and
  `page-conflict`. They now say that a page saves as it is typed, that several
  people edit the same page at the same time, including the same paragraph and
  the title, and that Numo and MCP edits appear live. They state what happens
  offline, on navigation and on closing with unsaved changes, and that a
  refused change is undone with a message. They describe named colored carets
  (none for readers). The conflict banner is limited to reloads with
  overlapping unsaved changes. The obsolete statement that simultaneous edits
  inside one block are not merged was removed.

Knowledge: `content/knowledge/pages.md` (live editing, saving, Numo and MCP
edits).

Workflows: P02, P03, P05 (no change to their steps beyond the article text).

## Claims checked against the source

- Same-paragraph merging, title merging and caret mapping:
  `lib/page-collaboration-stream.test.ts` with the real page schema.
- Unsaved changes survive a dropped connection (retry with backoff, catch-up
  before resending) and navigation (headless stream state), and are lost on
  closing. `pagehide` keepalive is not an acknowledgement, and the
  `beforeunload` warning is in `components/pages/page-view.tsx`.
- A refused change is reverted and announced: `CollabStream.revertUnconfirmed`
  and `Pages.liveEditRefused`.
- A title over 500 characters is refused by the authority, and the field caps
  input at 500.
- Numo and MCP edits appear live: they commit through the same authority and
  wake connected sessions through the page broadcast.
- Readers publish no caret: `publishCaret` requires write access.
- Conflict banner only after a reset with overlapping block changes:
  `CollabStream.applyReset` and `mergeDocs`.

## Figures

`page-comments-and-collaboration-steps` (the activity dialog) shows no caret
or save control and stays accurate. No figure was recaptured. A capture
showing two collaborators' carets would help the article, but it needs a
seeded two-member session, which this review did not run. That gap is
recorded here rather than closed with an invented capture.

## Browser verification

After the article review, an automated two-member session (headless Chromium
against the development server, disposable accounts and project, deleted
afterwards) typed into the same paragraph at once. Both screens and the stored
page converged with no lost character, each screen showed the other's named
caret, and a title change arrived live. It found and fixed two defects before
this record: carets disappeared because Supabase closes a channel after five
Presence updates per 30 seconds (carets now use Broadcast), and a caret
sequence restarted with each channel handle. No figure was captured from it.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check`.
