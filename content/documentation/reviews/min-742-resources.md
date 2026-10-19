# Resources review (MIN-742)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source and
localized-passage review with one recaptured figure, not human reader
acceptance or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope

- Resources render as Finder-like cards (the image itself or the type's
  colored icon, a two-line name that keeps its extension, the size in blue).
  A click or a right-click opens the card's menu: **Preview** / **Open link** /
  **Open page**, **Rename**, **Download**, **Remove**, as they apply. Numo's
  composer and message context rows keep the compact chip, where attachments
  share one line with context chips. A file mention opens the same reader.
- A link card shows the page's `og:image` (stored as a small WebP thumbnail
  when the link is added), otherwise its favicon tile. Links added before
  this change keep the favicon.
- A file or link resource can be renamed by the person who added it, from the
  card's menu and from the reader's **File actions** (`…`) menu. A page
  resource keeps its page's live title and offers no rename. Entries not yet sent from a composer (creation dialogs,
  comments, replies) are renamed locally.
- Removing a resource always asks for confirmation, from the card and from the
  reader, including composer entries, uploads in flight and page file and image
  blocks.
- The `@` menu of a description, plan or comment lists the resources attached
  to that surface only. A mention of a resource attached elsewhere renders as
  **Unavailable** (`components/typed-mention-chip.tsx`, `docs/mentions.md`).

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `issues`: the editor paragraph (`create-an-issue` section) and the file
  actions paragraph (`issue-discussion-and-resources` section).
- `objectives`: the editor paragraph (`objectives` section).

## Figures

`issue-file-preview` (`file-preview.png`) recaptured on 2026-10-19 in all six
locales with `node captures/shots/file-preview/shot.mjs <locale>`, the isolated
fixture of the real reader. Its menu now shows Download, Rename and, after a separator, Remove;
the script asserts the keyboard order of the three items. Each image was
opened for the localized labels, the menu and the four margins (en, de and
pt-BR inspected visually; all six share the 2336 x 1616 frame).

No other figure shows the changed controls: `work-resources.png` shows the
add-link dialog, which is unchanged.

## Limitations

No browser walkthrough of the application was run. Renaming, confirmation and
scoped mentions are covered by `components/resources-actions.test.tsx`,
`components/resources-preview.test.tsx`, `components/resource-card.test.tsx`,
`lib/middle-truncate.test.ts`, `lib/server/link-preview.test.ts`,
`lib/server/link-resource.test.ts`, `components/typed-mention-chip.test.tsx`,
`lib/use-resource-mentions.test.tsx`, `lib/server/resource-rename-route.test.ts`,
`lib/server/attachment-rename.test.ts` and `lib/server/mention-access.test.ts`.
