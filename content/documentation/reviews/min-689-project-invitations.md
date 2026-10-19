# Project creation invitations review (MIN-689)

Date: 2026-10-19. Reviewer: `agent:/root`. This is an agent source, unit-test
and localized-passage review with an end-to-end walkthrough against the local
candidate, not human reader acceptance or a deployed release test. One figure
was recaptured (`project-members-steps`). Application and desktop versions are
unchanged (0.11.1).

## End-to-end walkthrough

Against the local candidate (`npm run dev`) with throwaway Verify Bot accounts,
deleted afterwards with their projects. Recipients used `example.com`
addresses, so no real email was delivered.

- Wizard, email only: no project and no invitation request before **Finish**;
  after it, one pending Member invitation tied to an existing account (address
  typed in uppercase) and one for an address without an account.
- Collaborators: with B a reader of the owner's first project and C only
  invited there, `GET /api/me/collaborators` returned B alone. Inviting C or a
  random id by `user_id` returned 404 with "This person is not part of your
  projects."
- Wizard pick: typing B's name and pressing Enter queued B with avatar and
  name; **Finish** created a pending Member invitation tied to B's account.
- Settings pick: in **Project settings** → **Members**, typing in the
  **Invite people** field proposed B under **From your projects**; choosing B
  and **Invite** created a pending invitation tied to B's account.

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
- Nothing is sent during the wizard. The list, including people picked by
  name, is saved with the project draft, so it survives a resumed creation or
  the Git provider round trip.
- When the owner chooses **Finish**, the project is created (and its initial
  brief page saved, if any); only then is one invitation sent per queued
  person, with the **Member** role. The finishing step's summary counts the
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

### Follow-up: people from your projects

- The step's field takes a name or an email (**Search by name or enter an
  email**). Below it, **From your projects** proposes up to five people who
  have already joined a live project the owner belongs to, as owner, member
  or reader, with their avatar, name and email; it filters by name or address
  as the owner types and hides people already queued. Choosing one queues them
  with their avatar and name. Enter picks the only match; typing the address
  of such a person also queues them by name; anything else must be a valid
  address (**Choose someone from the list or enter a valid email address.**).
- Only joined accounts with a verified email appear: a pending invitation
  never makes its recipient a collaborator. The list comes from
  `GET /api/me/collaborators` and reveals nothing members of a shared project
  cannot already see in its member list.
- At **Finish**, picked people are invited by account (`user_id`): the server
  checks again that they joined one of the owner's projects and uses their
  verified address, never one supplied by the client. Unknown, unverified or
  unrelated accounts all receive the same refusal, **This person is not part
  of your projects.** (`ApiErrors.collaboratorNotFound`), which the failure
  notification shows next to the person's name. Everyone else is still
  invited by email as before. Role, Inbox acceptance and the **Pending
  invitations** card are unchanged.
- The same search lives in **Project settings** → **Members**. The invite
  card is renamed **Invite people** (`Members.inviteCardTitle`; formerly
  **Invite by email**). Its field takes a name or an email
  (`Members.inviteSearchPlaceholder`); while the owner types, **From your
  projects** (`Members.inviteSuggestionsLabel`) proposes up to five
  collaborators, excluding current members and pending invitations.
  Choosing one places the person, with avatar and name, in the field; the
  owner then picks the role (**Member** or **Reader**, **Can comment** for a
  reader) and chooses **Invite**. Enter on a name that matches one person
  selects them; a name matching none or several is refused with
  `Members.inviteChooseOrEmail`. Anyone else is invited by email. The server
  recheck and the `ApiErrors.collaboratorNotFound` refusal are the same as in
  the wizard. Unlike the wizard, the settings list appears only once
  something is typed, and typing a collaborator's exact address invites that
  address by email.

Evidence: `components/create-project-wizard.tsx`, `lib/project-draft.ts`,
`lib/members-api.ts`, `components/create-project-wizard.test.tsx`,
`lib/project-draft.test.ts` and the `Projects.wizardMembers*`,
`Members.guestCount`, `Members.inviteLimitReached` and `Common.skip` catalog
entries in `messages/<locale>.json`. Follow-up evidence:
`lib/server/collaborators.ts`, `app/api/me/collaborators/route.ts`,
`lib/server/members.ts` (`inviteMember` with `userId`),
`app/api/projects/[id]/members/route.ts`, `lib/server/members.test.ts`
(inviting a collaborator by account, listing joined and verified
collaborators), the collaborator cases of
`components/create-project-wizard.test.tsx`, and the
`Projects.wizardMembersFieldLabel`, `Projects.wizardMembersPlaceholder`,
`Projects.wizardMembersSuggestionsLabel` and `ApiErrors.collaboratorNotFound`
catalog entries. Settings evidence: `components/project-members.tsx`,
`lib/collaborator-search.ts`, `components/collaborator-suggestions.tsx` and
the `Members.inviteCardTitle`, `Members.inviteFieldLabel`,
`Members.inviteSearchPlaceholder`, `Members.inviteSuggestionsLabel` and
`Members.inviteChooseOrEmail` catalog entries.

## Articles and workflows

Articles, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`:

- `first-project` (workflow S01): the procedure mentions the optional
  invitation step (skip it for the manual example, or search people from
  your other projects by name or enter emails; nothing is sent before
  **Finish**), and the recovery section explains the notification, which
  names each person who was not invited. The `de` and
  `es` procedures gain a step; the `it` and `pt-BR` procedures, which describe
  the whole wizard in their first step, gain a sentence there.
- `projects` (workflows S05, S06): the `project-members` section gains a
  paragraph on invitations queued in the wizard, their **Member** role, the
  guest limit, the saved draft and recovery through the **Pending
  invitations** card. After the follow-up it is two paragraphs: the step
  (search by name in **From your projects**, the joined-and-verified
  condition, email for everyone else) and what happens at **Finish**
  (invitation by account with a server recheck, the
  **This person is not part of your projects.** refusal). The first paragraph
  of the section now names the **Invite people** card and describes the same
  search there, so the wizard paragraph refers to that card instead of
  repeating the conditions. No other article names the former **Invite by
  email** card in any locale (searched by each locale's former label).

The follow-up lands before MIN-689 is released, so it extends the same
article revision (`first-project` 7, `projects` 12) instead of raising it
again: the MIN-689 clauses of `review.fact` and `review.language` mention the
collaborator search, and `projects` lists `lib/server/collaborators.ts` and
`app/api/me/collaborators/route.ts` in `compatibility.evidence`. Every locale
carries the same metadata.

Localized UI labels are taken from the catalogs as shipped, including the
Italian **In attesa di inviti** and **Finitura** already used by the product.
Tutorial steps keep the existing unformatted style of each locale's
`first-project` procedure. `content/documentation/coverage.json` needs no
change: S01, S05 and S06 keep their articles and sections.

## Figures

Reviewed, with their revision raised to the new article revision:

- `first-project-steps` (`reader-first-project.png`): a completed
  demonstration issue; it does not show the wizard.
- `project-settings-steps` (`project-general.png`): the project identity
  header; unaffected.
- `project-members-steps` (`project-members.png`): recaptured on 2026-10-19 in
  the six locales with `documentation-refresh` (screen `project-members`) from
  the local candidate and inspected: the **Invite people** card with its
  name-or-email placeholder above the **Members** card. Alt text, viewport and
  capture date updated in every locale; the capture records are in
  `visual-refresh-captures-2026-10-09.json`.

None of them shows the wizard's invitation step, and they are accurate after
the follow-up. No
figure of the new step was added: the paragraph names its few controls and the
tutorial skips the step.

## Checks

`npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` were run after the edits.
After the follow-up, these and `npm run check:documentation:release` passed.

## Limitations

No project was created and no invitation was sent in a browser; the sending
order, partial failure, draft persistence and the collaborator search are
covered by the unit tests listed above; no real collaborator list was read. The phone layout of the step was not reviewed.
