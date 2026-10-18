# Typed mentions review (MIN-734)

Date: 2026-10-18. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope

A mention becomes a typed reference stored as a Markdown link,
`[@Label](mention:<type>/<id>)`. It follows renames, survives editing and
copy-paste, and a reader who cannot open its target sees a neutral
**Unavailable** mention. Agents read the same rule. The contract is
[docs/mentions.md](../../../docs/mentions.md).

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `issues`, revision 17, `create-an-issue`: one paragraph addition. A
  mention points at its target, follows a rename, survives editing and
  copy-paste into another description, comment, page or the Numo composer;
  a reader without access sees an **Unavailable** mention
  (`Common.mentionUnavailable`) without its name or project.

No figure changed: no capture shows a mention of a renamed or inaccessible
target.

## Sources checked

- `lib/mention-link.ts`, `components/mention-node.ts`,
  `components/markdown-mention.tsx` (legacy hydration),
  `components/typed-mention-chip.tsx`, `components/markdown.tsx`,
  `lib/mention-resolution.ts`, `app/api/mentions/resolve/route.ts`,
  `lib/server/mention-access.ts`.
- Agents: `mentionsForReader` (`lib/server/mcp/tool-helpers.ts`, applied to
  every MCP tool reply) and `executeTool` (Numo).
- Paste: `lib/mention-paste.ts`, `components/assistant/chat-input.tsx`.
- Notifications and backlinks: `lib/server/description-mentions.ts`,
  `lib/pages-mentions.ts`, `lib/server/add-comment.ts`,
  `lib/server/page-comments.ts`, `lib/server/page-links.ts`.
- Tests listed in `docs/mentions.md`.

No browser walkthrough was run for this review.
