# Project creation invitations review (MIN-689)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review, not human reader acceptance, a browser
walkthrough or a deployed release test. No figure was recaptured. Application
and desktop versions are unchanged (0.11.1).

## Scope

- The project creation wizard has an optional **Invite your team** step right
  before **Finishing touches**, on both the brand-new and the existing-work
  paths. The owner enters an email and chooses **Add** (or presses Enter);
  each address is listed with a remove button. Invalid addresses, duplicates
  and the owner's own address are refused with a message, and an address
  still typed is added when the owner continues. The plan's guests-per-project
  limit is shown with the same messages as **Project settings** →
  **Members** and stops adding at the limit. The step's button reads **Skip**
  while the list is empty.
- Nothing is sent and no account is looked up during the wizard. The list is
  saved with the project draft, so it survives a resumed creation or the Git
  provider round trip.
- When the owner chooses **Finish**, the project is created (and its initial
  brief page saved, if any); only then is one invitation sent per address,
  with the **Member** role. The finishing step's summary counts the
  invitations to send.
- A refused invitation (plan limit, rate limit, already invited) does not stop
  the others and does not undo the project. A persistent notification lists
  each address that was not invited with its reason and advises checking the
  pending invitations in the project's member settings before inviting again.
  A successful invitation is recorded and pending; email delivery is not
  confirmed.
- These invitations are accepted in Inbox like those sent from
  **Project settings** → **Members**, where the owner can change a pending
  invitation's role.

Evidence: `components/create-project-wizard.tsx`, `lib/project-draft.ts`,
`lib/members-api.ts`, `components/create-project-wizard.test.tsx`,
`lib/project-draft.test.ts` and the `Projects.wizardMembers*`,
`Members.guestCount`, `Members.inviteLimitReached` and `Common.skip` catalog
entries in `messages/<locale>.json`.

## Articles and workflows

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `first-project` (workflow S01): the procedure mentions the optional
  invitation step (skip it for the manual example, or add collaborators'
  emails; nothing is sent before **Finish**), and the recovery section
  explains the notification for invitations that were not sent. The `de` and
  `es` procedures gain a step; the `it` and `pt-BR` procedures, which describe
  the whole wizard in their first step, gain a sentence there.
- `projects` (workflows S05, S06): the `project-members` section gains a
  paragraph on invitations queued in the wizard, their **Member** role, the
  guest limit, the saved draft and recovery through the **Pending
  invitations** card.

Localized UI labels are taken from the catalogs as shipped, including the
Italian **In attesa di inviti** and **Finitura** already used by the product.
Tutorial steps keep the existing unformatted style of each locale's
`first-project` procedure. `content/documentation/coverage.json` needs no
change: S01, S05 and S06 keep their articles and sections.

## Figures

Reviewed and retained without recapture, with their revision raised to the
new article revision:

- `first-project-steps` (`reader-first-project.png`): a completed
  demonstration issue; it does not show the wizard.
- `project-settings-steps` (`project-general.png`): the project identity
  header; unaffected.
- `project-members-steps` (`project-members.png`): the **Invite by email** and
  **Members** cards of project settings, whose controls did not change.

None of them shows the wizard's invitation step, so they stay accurate. No
figure of the new step was added: the paragraph names its few controls and the
tutorial skips the step.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` were run after the edits.

## Limitations

No project was created and no invitation was sent in a browser; the sending
order, partial failure and draft persistence are covered by the unit tests
listed above. The phone layout of the step was not reviewed.
