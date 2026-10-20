# MIN-743 destructive-action confirmations review

Date: 2026-10-20. Reviewer: agent:/root. This is an agent factual and
language review of the source on the same branch, not human reader acceptance,
a browser walkthrough or a deployed release test. No figure was captured or
recaptured. Application and desktop versions are unchanged (0.11.1).

The changed outcome: several gestures that previously ran in one click now
open an alert dialog that names the target before acting. The manual is
updated only where an article already describes the gesture.

## Articles and passages

In `en`, `fr`, `de`, `es`, `it` and `pt-BR`, one revision each:

- `projects`: `hide-project` (the settings **Hide** button now confirms like
  the sidebar menu, `Nav.hideProjectConfirmTitle`; showing again stays
  immediate), `project-settings` (**Remove the image**,
  `Settings.removeProjectIconTitle`), `project-removal` (**Leave**,
  `Settings.leaveProjectTitle`) and `member-permissions` (pending-invitation
  cancellation, `Members.cancelInvitationTitle`).
- `databases`: `Edit options` saving with deleted options
  (`PageDatabase.deleteOptionsTitle`, `PageDatabase.deleteOptionsConfirm`).
- `pages`: page-menu **Move to trash** (`Pages.trashPageTitle`,
  `Pages.trashPageBody`, 30-day retention from `lib/trash-retention.ts`) and
  `revoke-page` (`PublishPage.unpublishTitle`, `PublishPage.unpublishConfirm`).
- `views`: `revoke-view` (`ShareView.stopSharingTitle`,
  `ShareView.stopSharingConfirm`).
- `issues`: `blocker-state` relation removal (`Relations.removeTitle`).
- `feedback`: a visitor deleting their own public comment
  (`PublicFeedback.commentDeleteTitle`) and unlinking a post from its issue
  (`FeedbackBoard.unlinkIssueTitle`).

Localized labels come from each catalog. The `pt-BR` leave clause and the
`it` page-trash clause describe the action without quoting the catalog
labels (`Settings.leave` "Deixe", `Pages.deletePage` "Spostati nel cestino"),
whose wording reads as a catalog issue rather than a stable control name.

## Not changed

`notifications-and-inbox` does not describe deleting a single notification,
`task-notebook` does not describe removing done and dropped tasks, and
`feedback` does not describe disabling SSO from the identity menu, so those
confirmations need no article edit. `code-work` already presents bulk pull
request unlinking without claiming it runs immediately.

## Sources

`components/ui/confirm-delete-dialog.tsx`,
`components/settings/project-visibility-section.tsx`,
`components/settings/project-general-section.tsx`,
`components/settings/project-identity-header.tsx`,
`components/project-members.tsx`,
`components/pages/database-property-dialogs.tsx`,
`components/pages/page-document-actions.tsx`,
`components/pages/page-publish-dialog.tsx`,
`components/share-view-dialog.tsx`, `components/relations-section.tsx`,
`components/objective-relations-section.tsx`,
`components/feedback/feedback-team-page.tsx` and
`app/f/[token]/public-comments.tsx`, with `messages/*.json`.
