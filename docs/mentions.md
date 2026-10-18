# Mentions

MIN-734. A mention is a typed reference to a person, an issue, an objective, a
project or a page. This document is the contract between the editors, the
renderers, the server and the agents.

## Stored format

A mention is stored in Markdown as a standard link:

```markdown
Fix [@MIN-42](mention:issue/9f1c2a3b-…) with [@Jean Dupont](mention:member/5ad9b962-…).
```

| Part | Meaning |
| --- | --- |
| `@Label` | The label the author saw when mentioning. Readers of the raw Markdown (agents, webhooks, GitHub) see this text. |
| `mention:<type>/<id>` | The target: `member`, `issue`, `objective`, `project` or `page`, and its stable id. |

`lib/mention-link.ts` builds, parses and rewrites the format
(`mentionMarkdown`, `parseMentionHref`, `mentionLinks`, `mentionedIds`,
`relabelMentions`, `splitMentionLinks`, `restoreStoredMentions`). Link text
escapes every Markdown punctuation (`[ ] \ * _ \` ~ < > & | ! #`), so a label
reads back unchanged, and is capped at 256 characters; the parsers are linear
on any text.

Two mentions are not typed links, on purpose:

- `@Numo` stays plain text: it is the trigger Numo listens for.
- On pull requests, forge accounts stay `@login`, which the forge resolves.

## Editors

The mention node (`components/mention-node.ts`) carries `mentionType`,
`mentionId` and `mentionLabel`.

- A mention picked from the `@` menu is written as a typed link. It parses
  back from Markdown (markdown-it renders an anchor, which the node reads ahead
  of the link mark) and from copied HTML (the node renders an anchor).
- A pill rebuilt from older `@Label` text (`hydrateMentions`, attribute
  `legacy`) is written back as that text. It was found by its label, not
  picked: writing it as a typed link would turn a label match into an
  identity, and would change the text of a live document on a mere read,
  which the collaboration server refuses for presentation batches. Such text
  is still read by the label scanner (`lib/mention-scan.ts`); a mention picked
  again becomes typed.
- Tasks, plans and the notebook keep their formats: a typed mention is an
  inline link, so `lib/plan.ts` still reads its lines.

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

In an editor, the pills a selection covers are marked `mention-selected` and
painted in the selection color: an atom is not painted as selected text by
the browser.

Read-only renders (`components/markdown.tsx`) keep `mention:` links through
react-markdown's URL rules and the sanitizer, and do not rescan their text.
Copying rendered text puts each pill in the clipboard as its `mention:`
anchor (HTML) and as `@Label` (plain text). Copying from an editor carries
the label each pill showed (`transformCopied`, `shownMentionLabel`): the
current label, or `unavailable`, never the stored one.

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

## Limits

- The stored label is the author's text. The UI and agents never show it in
  place of a resolution, but it is part of the Markdown the server stores and
  returns to members of the document's own project.
- Mentions written before MIN-734 stay label-scanned until someone picks them
  again from the menu; there is no backfill.

## Tests

- `lib/mention-link.test.ts`: format, escaping, relabeling, and the round trip
  through the page projection and the plan parser.
- `lib/server/mention-access.test.ts`: resolution per type and access, and
  relabeling of what agents read.
- `components/typed-mention-chip.test.tsx`: the rendered pill shows the live
  label or the neutral pill, never the stored label, and a just-picked mention
  appears without a server round trip.
- `components/mention-selection.test.ts`: pills inside a selection are marked.
- `lib/mention-paste.test.ts`: paste into the Numo composer.
- `lib/server/description-mentions.test.ts`: notifications from typed
  mentions.
