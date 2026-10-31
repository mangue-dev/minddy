# Mentions

MIN-734, MIN-872, MIN-879. A mention is a typed reference to a target: a person, an
issue, an objective, a project, a page, a resource (an attachment) of the
surface being written (MIN-742), and since MIN-872 a pull request, a routine,
the task notebook, a cycle, a repository skill, a connected MCP server or a
date. This document is the contract between the editors, the renderers, the
server and the agents.

## Stored format

A mention is stored in Markdown as a standard link that holds no name:

```markdown
Fix [@](mention:issue/9f1c2a3b-…) with [@](mention:member/5ad9b962-…) by [@](mention:date/2026-11-02?time=09:30).
```

| Part | Meaning |
| --- | --- |
| `@` | Empty link text. The name is resolved for each reader from the id, so a rename never breaks a mention and a reader who may not see the target learns nothing from the Markdown. |
| `mention:<type>/<id>` | The target's type (`MENTION_TYPES`) and its stable id. |
| `?key=value&…` | Metadata the target needs besides its id, at most four entries of `[A-Za-z0-9_.:-]`: a date's `time` (`HH:MM`) and `end` (`YYYY-MM-DD`), a skill's `project`. |

| Type | Id | Metadata |
| --- | --- | --- |
| `member`, `issue`, `objective`, `project`, `page`, `resource`, `pull_request`, `routine`, `cycle`, `mcp` | the row's UUID (`mcp`: the connection's) | none |
| `scratchpad` | always `notebook`: the feature, never one of its tasks | none |
| `skill` | the folder holding the skill's `SKILL.md` | `project` |
| `date` | a local calendar day, `YYYY-MM-DD` | `time`, `end` |

Mentions written between MIN-734 and MIN-872 carry the label their author
saw (`[@MIN-42](mention:issue/…)`). They still parse, their label is never
shown, and it stays stored until the mention is picked again: an editor node
keeps it in `mentionLabel` and writes it back unchanged, because rewriting a
live document on a mere read is refused by the collaboration server. There is
no backfill.

`lib/mention-link.ts` builds, parses and rewrites the format
(`mentionMarkdown`, `parseMentionHref`, `mentionLinks`, `mentionedIds`,
`relabelMentions`, `splitMentionLinks`, `restoreStoredMentions`,
`withoutMentionLabels`, `mentionTargetKey`). Link text escapes every Markdown
punctuation (`[ ] \ * _ \` ~ < > & | ! #`), so a label reads back unchanged,
and is capped at 256 characters; the parsers are linear on any text.

Two mentions are not typed links, on purpose:

- `@Numo` stays plain text: it is the trigger Numo listens for.
- On pull requests, forge accounts stay `@login`, which the forge resolves.

## Editors

The mention node (`components/mention-node.ts`) carries `mentionType`,
`mentionId`, `mentionLabel` (the stored label: empty for every new mention)
and `meta` (the metadata as `key=value&…`).

- A mention picked from the `@` menu is written as a typed link without a
  label (`mentionAttrsFromOption`). It parses back from Markdown (markdown-it
  renders an anchor, which the node reads ahead of the link mark) and from
  copied HTML (the node renders an anchor). A pasted pill drops whatever
  label its copy carried (`transformPasted` in
  `components/markdown-mention.tsx`).
- A pill rebuilt from older `@Label` text (`hydrateMentions`, attribute
  `legacy`) is written back as that text. It was found by its label, not
  picked: writing it as a typed link would turn a label match into an
  identity, and would change the text of a live document on a mere read,
  which the collaboration server refuses for presentation batches. Such text
  is still read by the label scanner (`lib/mention-scan.ts`); a mention picked
  again becomes typed.
- Tasks, plans and the notebook keep their formats: a typed mention is an
  inline link, so `lib/plan.ts` still reads its lines.

## The `@` menu

`lib/use-mention-sources.ts` lists people, projects, issues, objectives and
pages; `lib/use-feature-mentions.ts` adds, once the reader types `@`, the
task notebook, the reader's current and upcoming cycles (as many as their
settings create, and none while cycles are off, from `GET /api/me/cycle`),
their routines, the surface project's repository skills (only on a surface
with a project), their enabled MCP connections and pull requests, the open
ones first and the completed ones after (`GET /api/pull-requests`). None of
them loads before the first `@`.

Dates come from the query itself (`lib/mention-date.ts`). `parseDateQuery`
first asks [chrono-node](https://github.com/wanasit/chrono) to read the whole
query in the reader's language, then in the five others; a reading counts only
when it covers the whole query, so `day after tomorrow` never comes back
as `tomorrow`. Our own layer adds what chrono misses: a day two days away in every
language, a weekday some weeks ahead (`thursday in 2 weeks`), the end of
the month, the weekend, a bare day of the month (`the 15th`), small numbers
written out, and keywords while they are being typed (`tom`). Accents,
hyphens and apostrophes are optional, and a trailing time reads in each
language's forms (`9h30`, `9 o'clock`, `9pm`, and their translations), and
a time said in words first becomes that form (`spokenTimes`: half past,
quarter past and to, three quarters, noon and midnight, in each language). The
query is first corrected word by word (`correctTypos`): an unknown word one
typo away from a word the parser reads takes its place, with one typo allowed
from four letters and two from eight, counted as Damerau-Levenshtein edits, as
search engines do by default. A word still being typed is never corrected. The
menu lists the readings under **Dates**, after the other matches (first when
the query clearly is a date, `datesFirst`, so Enter picks it), and stays
open while the query may still become a date (`isDatePrefix`).

`@date` (and its translations) is a stable entry: it inserts now and opens
the date picker on the new pill (`requestDatePicker`).

The Numo composer and routine instructions use the same mentions as every
other text. The composer writes each pill as its typed link
(`composerText` in `components/assistant/chat-input.tsx`) and offers the same
targets and dates; its skills stay the attached skill pills a message carries,
picked with `@` or `/` (there is no `$` menu any more). A routine instruction
is stored as the editor's Markdown (`promptFromMarkdown`); an older
instruction, saved as `@Label` tokens with identities and `$name` skills,
reads back as pills and is stored in the new form at its next save. Numo
reads a user message named for its user (`markdownForReader` in
`lib/server/numo/turns.ts`), and conversation and routine titles are made from
that named text, never from the raw links.

## What a reader sees

A typed mention never shows its stored label. The pill
(`components/typed-mention-chip.tsx`) shows the target's current label, which
follows renames:

1. from what the reader already holds: a mention just picked from the menu
   (`primeMentionLabel`), or the sources on screen (`MentionLinks.label`: the
   surface's members and projects, and the reader's issues, objectives and
   pages). These pills appear at once;
2. otherwise from `POST /api/mentions/resolve`, batched and cached in memory
   for a minute (`lib/mention-resolution.ts`).

The server (`lib/server/mention-access.ts`) answers with the current label
when the reader can open the target, and `null` otherwise. Unknown, deleted
and inaccessible targets are indistinguishable. A `null` renders the neutral
**Unavailable** pill, with no name, figure, project or link. While a label
resolves, the pill shows an ellipsis.

Access rules:

| Type | Visible when |
| --- | --- |
| issue, objective, page | the reader has access to its project, and it is not trashed |
| project | the reader has access to it |
| member | the reader shares a project with them (as a member or its owner), or is them |
| resource | the server: the reader has access to its project. The app: it is attached to the surface being read (see Resources) |
| pull request | the reader has access to a project linking its repository |
| routine | the reader has access to its project, and it is not trashed |
| skill | the reader has access to the project its `project` metadata names |
| cycle, mcp | the reader owns it |
| scratchpad | always: it names the feature, and opens the reader's own notebook |
| date | always: it is its own value, never sent to the server |

A cycle pill reads "Cycle" and its window, a pull request `#12` and its title,
a date "Today", "Tomorrow" or "Yesterday" while it is that close and the full
date otherwise (`formatMentionDate`; the server render, which does not know
the reader's day, always shows the full date). Hovering a date pill that shows
a full date tells how far it is from now (`relativeMentionDate`: "in 3
weeks"), and one with a time that close, in hours or minutes. In an editor, a click on a
date opens the date and time picker and writes the new day into the node
(`components/date-mention-chip.tsx`). minddy schedules nothing from a date.

Hovering a pill shows its target's hover card (MIN-879,
`components/mention-hover-card.tsx`) in the signed-in app, which provides it
through `MentionHover` (`components/mention-hover.tsx`): the marketing site and
public pages render the pill alone and never load the card. It is read only
when the card opens, from
`GET /api/mentions/preview?type=&id=&project=` (`lib/server/mention-preview.ts`).
The server first resolves the target with `resolveMentionTargets`, under the
access rules below: a target without a label for the reader has no card
either, and the answer is `null` for unknown, deleted and inaccessible targets
alike. Only then does it read the details, scoped to the project that
resolution allowed. Pages, routines, cycles and MCP connections skip that
pass: their own readers (`getPage`, `getRoutineForUser`, the owner filter)
apply the same rule.

| Type | Card |
| --- | --- |
| issue | the board card itself (`IssueCardBody`, read-only), with its project, assignee, categories, objective, parent and relations |
| objective | status indicator, name in its color, progress ring and lead beside it, target date, relations as pills, the start of its description |
| page | title, icon, project, last edit, the first lines of its body under a fade; a database shows its first rows and columns as its table draws them (widths, header icons, option badges, checkboxes, 40px rows), fading out to the right and at the bottom |
| routine, skill, scratchpad | the first lines of the instruction, `SKILL.md` or notebook; a routine shows its state badge beside its title and when it runs next, the notebook its task count |
| project | its members, owner first, each with a colored role badge |
| member | name, email, avatar, a colored role badge and the arrival date, in the project the pill is read in (`MentionLinks.projectId`) when the reader shares it, else in a project both share |
| pull request | state, repository, branches, author, when it opened or merged |
| mcp | its service's logo, a state badge (signed in, sign-in needed, turned off) and its tool count, from a live connection (`POST /api/account/mcp-connections/[id]/test`) asked only once the card is open |
| cycle | its window and progress over the reader's issues in it |

Issue, objective, page and routine cards show their project at the top left,
as an issue card does. A click on the card does what a click on the pill does
(`MentionHover`'s `onOpen`). An MCP pill shows its service's logo
(`McpServiceLogo`): the resolution answers it as `service`
(`lib/mcp-catalog.ts`). A page pill shows the page's emoji, or without one
the database glyph of the page tree for a database and the page glyph
otherwise: the resolution answers `icon` and `database`, so MCP and page
pills ask the server even when the surface's sources already named them. Every pill keeps the default arrow cursor
(DESIGN.md), never the text caret or the pointer hand.

What a card costs, kept off navigation:

- The app shell holds only the card's shell (`mention-hover-card.tsx`: the
  hover logic, the query, a skeleton). The bodies (`mention-preview-cards.tsx`,
  with the issue card, the read-only editor, database cells) load on the
  first card about to open.
- A pointer resting 150 ms on a pill reads its card ahead (the bodies' code
  and `GET /api/mentions/preview`), before the card's own 450 ms delay opens
  it; a pointer only crossing a paragraph reads nothing, and a touch never
  does. Focus reads ahead at once.
- Answers stay fresh a minute and are never persisted to disk.
- On the server, a page, a routine, a cycle and an MCP connection are read
  through their own guarded readers, without a resolution pass first; a
  database reads only the rows its card shows, and counts the rest.
- A typed pill subscribes twice to the resolution cache: its label, and what
  came with it (`useResolvedMentionDetails`).

A date keeps its relative tooltip, and a resource its click preview: both
have no card. Excerpts are Markdown cut at a line (`cutExcerpt`) and rendered
by the read-only document editor (`LazyDocumentEditor`), so code blocks,
callouts, task lists and pills look as in the text. Like a database's rows,
an excerpt starts under the card's title, on a surface wider than the card,
fades out to the right and at the bottom, and is dimmed as a whole so the
title reads first; its typed pills resolve
like any other, so a card never prints a stored label. The card opens on mouse hover and keyboard
focus, never on touch, so a tap keeps its meaning. Page backlinks, page
resources of issues and objectives, the statistics graph's dots and objective
anchors, the statistics landscape pills, relation rows and creation-dialog
relation pills (`RelationRow`, `CreationRelationPills`), the objective field
of the issue panel and triage, the pills of the Numo composer (the panel, the
shell and the home page), and the people of activity logs,
comment headers and statistics contributors show the same cards. In an
activity line the person shows their card and the action keeps its
full-sentence tooltip (`OneLine` holds it back over `data-one-line-lead`).
An MCP agent there shows its own card (`components/agent-hover-card.tsx`),
laid out as a project's: the agent's logo and name over "MCP", then the
person whose key it used. It is built from the activity line itself and reads
nothing.

A pull request opens the Pull requests screen, a routine its detail, a cycle
the global board's cycle view, an MCP server its settings card, and the
notebook opens in place (`lib/mention-target.ts`). A skill leads nowhere; its
pill shows its hover card.

In an editor, the pills a selection covers are marked `mention-selected` and
painted in the selection color: an atom is not painted as selected text by
the browser.

Read-only renders (`components/markdown.tsx`) keep `mention:` links through
react-markdown's URL rules and the sanitizer, and do not rescan their text.
Copying rendered text puts each pill in the clipboard as its `mention:`
anchor (HTML) and as `@Label` (plain text). Copying from an editor carries
the label each pill showed (`transformCopied`, `shownMentionLabel`): the
current label, or `unavailable`, never the stored one.

## Resources

A resource mention (`mention:resource/<attachment id>`, MIN-742) names an
attachment of the surface it is written on, and only that surface:

| Surface | Resources it can mention |
| --- | --- |
| Issue description and plan (panel, triage) | the issue's own resources |
| Objective description | the objective's own resources |
| Comment, reply, comment edit | that comment's own attachments |
| Issue and objective creation dialogs, comment composers | the entries added in the composer |

`lib/use-resource-mentions.ts` extends a surface's mention model with its
resources: the `@` menu lists them after the people, and `MentionLinks`
labels and opens them: a page resource in the app, a link in a new tab,
and a file in the shared reader (`openResourcePreview`, rendered once by
`components/resource-preview-host.tsx`); a format the reader cannot show
downloads. `components/typed-mention-chip.tsx` resolves a resource pill from those
links alone and never asks the server, so a mention of another ticket's
attachment renders as **Unavailable**. `Markdown` passes its `mentionLinks`
to its pills through context, which is how a rendered comment resolves its
own attachments.

A composer entry is mentionable before it is saved: its upload `localId` is a
UUID that the client sends as the resource `id` (`ResourceInput.id`).
`parseResourcesInput` keeps a valid, unrepeated UUID and `insertAttachments`
saves the row under it, so the mention written next to the entry points at
the row. A recovered draft keeps its ids.

The server resolves resource mentions for agents and plain previews
(`resolveMentionTargets`): the attachment's decoded name under project
access. It does not check the surface; that scope is the app's.

## Plain-text previews and excerpts

A preview that flattens Markdown must not print a stored label either:

- An issue card's description preview splits typed mentions out
  (`plainMarkdownParts` in `lib/plain-markdown.ts`) and renders each with
  `TypedMentionText`: `@` plus the current label, or the neutral label.
- The inbox's comment excerpt is relabeled for its recipient
  (`lib/server/inbox.ts`).
- A page's search text reduces each typed mention to `@…`
  (`pageSearchText`), so search excerpts carry no label at all.
- A mention a truncation cut in half (`[@Secret ro…`) keeps nothing of its
  label (`stripCutMention`): in previews and in what agents read.

## Agents

Every MCP tool reply (`mentionsForReader` in `lib/server/mcp/tool-helpers.ts`)
and every Numo tool result (`executeTool`) is rewritten for the caller before
it is returned: each typed mention carries the target's current label, or
`@unavailable` when the caller may not see it. Distinct targets are resolved
in chunks; deeper than the walk goes, mentions read as unavailable. The
reference itself is kept.

Numo's rules (`buildSharedRules` in `lib/server/assistant/prompt.ts`) list
every type with where its id comes from and when to use it: a date for every
specific day it states, the notebook whenever it reads or changes it, a
routine it creates, changes or reports on, the MCP connection it used, the
skill it followed, a pull request it read. The tools hand it those ids:
`read_pull_request` returns minddy's `id` of the pull request, and each
selected skill comes with its ready-made mention. The descriptions of the
Markdown fields it writes repeat the same list (`MENTIONS_IN_MARKDOWN`).

Every Numo and MCP tool input first goes through `withoutMentionLabels`:
whatever label an agent writes, a mention is stored without one.

What an agent writes back is restored (`restoreStoredMentions`): a mention
of a target the stored text already names takes its stored link again, in
passage edits (`editTextPassage`), in whole rewrites of a description, plan
or objective (`updateIssueFields`, `updateObjective`, for Numo and MCP
writes) and in page rewrites and appends. A passage copied as the agent read
it therefore matches, and a rewrite never stores `unavailable` in place of
the author's label.

## Server consumers

- Notifications read member ids from typed mentions as well as from the
  label scan, always filtered to project members: descriptions
  (`lib/server/description-mentions.ts`), pages (`lib/pages-mentions.ts`),
  comments (`lib/server/add-comment.ts`, `lib/server/page-comments.ts`). An
  agent's comment, which has no client-side mention list, now notifies the
  people its typed mentions name.
- Page backlinks read page ids from typed mentions (`citedPageIds` in
  `lib/server/page-links.ts`); a page body's text keeps its typed nodes as
  links (`pageBlockTexts`), so a renamed page stays cited.

## Paste

- Between editors: the copied HTML carries the node's anchor, and the plain
  text its link form; both parse back into the same mention.
- Into the Numo composer: `lib/mention-paste.ts` splits the pasted HTML or
  link-form text, and each mention the composer knows becomes a pill with its
  id. Any other mention is pasted as its `@Label` text.

A reply posted to a forge (`forgeMarkdownFor` in
`lib/server/agent/pr-comment-reply.ts`) names each mention as its author sees
it before writing the plain `@Label` the forge reads.

## Limits

- A mention written between MIN-734 and MIN-872 keeps its author's label in
  the stored Markdown until it is picked again. The UI and agents never show
  it in place of a resolution.
- Mentions written before MIN-734 stay label-scanned until someone picks them
  again from the menu; there is no backfill.
- Routine instructions and Numo messages saved before MIN-872 keep their
  `@Label` text and identities until they are edited; messages are never
  rewritten.
- A date mention has no range editor yet: an `end` is read and shown, but
  only the day and time are edited from the pill.

## Tests

- `lib/mention-link.test.ts`: format, metadata, escaping, relabeling, agent
  input normalization, and the round trip through the page projection and the
  plan parser.
- `lib/mention-date.test.ts`: the date parser in six languages and the
  phrasings people type, the relative label and tooltip, `@date`, and the
  stored metadata.
- `lib/prompt-document.test.ts`: routine instructions stored as typed
  Markdown, and older ones read back as pills.
- `lib/chat-input-mention-node.test.ts`: the composer's typed links.
- `lib/server/numo/durable-turns.test.ts`: what the model reads of a typed
  mention.
- `lib/server/mention-access.test.ts`: resolution per type and access, and
  relabeling of what agents read.
- `components/typed-mention-chip.test.tsx`: the rendered pill shows the live
  label or the neutral pill, never the stored label, and a just-picked mention
  appears without a server round trip; only a visible target offers a hover
  card.
- `lib/server/mention-preview.test.ts`: hover card details per type, and
  nothing read for a target the reader may not see.
- `components/mention-hover-card.test.tsx`, `lib/mention-preview.test.ts`:
  what each card shows, and how excerpts are cut.
- `components/mention-selection.test.ts`: pills inside a selection are marked.
- `lib/mention-paste.test.ts`: paste into the Numo composer.
- `lib/server/description-mentions.test.ts`: notifications from typed
  mentions.
- `lib/use-resource-mentions.test.tsx`: resource options, labels and links
  scoped to a surface.
