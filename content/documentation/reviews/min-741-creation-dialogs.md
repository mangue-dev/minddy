# Creation dialogs review (MIN-741)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source and
localized-passage review with recaptured figures, not human reader
acceptance or a deployed release test. Application and desktop versions are
unchanged (0.11.1).

## Scope

- The issue and objective creation dialogs choose their project in a
  **Create in** control: a pill at the top left of the dialog, level with the
  close button, on desktop; beside the **New issue** / **New objective** sheet
  title on a phone. Changing the project clears the categories, objective,
  relations, parent and assignee (issue) or the lead and relations (objective)
  picked for the previous project.
- The issue create button names the identifier the issue will receive
  (`AUR-19` in the figures), computed from the project's issue counter that
  realtime keeps current. Its menu creates the issue and copies that
  identifier. The objective create button is a plain **Create objective**.
- On a phone, the dictation control is a square icon button beside the create
  button.
- The **Page** item of the resources **+** menu opens a searchable dropdown
  under the button instead of a dialog.

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `issues`: **Create in** location, cleared fields, identifier button and its
  copy menu (`create-an-issue` section).
- `objectives`: **Create in** location and cleared fields (`objectives`
  section).

The page picker change alters no documented step: the articles say a page can
be linked through the resources controls without describing the dialog.

## Figures

Recaptured on 2026-10-19 in all six locales with
`captures/shots/documentation-product/shot.mjs` (screens `new-issue` and the
new `reader-objectives`) against the local development candidate
(`http://localhost:3000`, working tree of branch
`work/min-741-creation-dialog-project-select`), demo account, Aurora project,
light theme, 2x density, 24 px padding. Business writes were blocked and none
was attempted; nothing was submitted. Records:
`content/documentation/reviews/product-captures-<locale>-2026-10-19.json`.

- `create-an-issue-steps` (`new-issue.png`): unsent issue draft with the
  **Create in Aurora** pill and the **Create AUR-19** split button. Display
  viewport 720 x 396 (720 x 358 in `fr`, where Smart Fill fits on the
  property row).
- `objectives-steps` (`reader-objectives.png`): unsent objective draft with the
  **Create in Aurora** pill, the localized description placeholder and the
  **Create objective** button. Display viewport 720 x 358. The objective is
  opened with the global `O` shortcut from the project's Objectives page.

Each image was opened and inspected for the intended state, localized labels
and demo text, fonts, the four 24 px margins, the dialog footer and clipping.
`AUR-19` is the demo project's next number on the capture date; it changes as
issues are created.

## Limitations

No submission, copy to the clipboard or project switch was exercised in the
browser; those behaviors are covered by `lib/creation-relations-dialogs.test.ts`
and `components/add-resource-page-picker.test.tsx`. The phone layout was not
captured.
