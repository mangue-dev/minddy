# GitHub issue synchronization

GitHub is the upstream source for a ticket linked through the GitHub App. The
`issues` and `issue_comment` webhooks update minddy automatically; repeated
deliveries are safe because GitHub delivery IDs and remote comment identities
are unique.

## Field mapping

| GitHub issue field | minddy destination |
| --- | --- |
| Title, body | Title, description |
| Open/closed state and close reason | Status; close reason is retained as GitHub metadata |
| Labels | Categories, plus recognized priority and effort labels |
| Assignees | The first linked minddy member among GitHub assignees |
| Milestone due date | Due date |
| Milestone details, author, association, issue type, lock state, timestamps, closing user | `github_metadata` returned by the issue API and MCP issue read |
| Issue comments | Native minddy comments, retaining remote identity, original author, URL, and timestamps |
| Inline attachment URLs | Preserved in the synchronized GitHub Markdown |

GitHub-only data is stored in the `github_issue_sync_metadata` and
`github_issue_comment_syncs` sidecars instead of being encoded into the issue
description or categories. GitHub's standard issue webhook does not include a
complete graph of issue dependencies, project fields, or uploaded file bytes;
those values remain accessible from the original GitHub issue link and are not
presented as native minddy relations or file uploads.

## Conflict and retry behavior

When GitHub supplies an `updated_at` timestamp, a payload older than minddy's
latest update cannot overwrite native fields. GitHub metadata and comments use
their own remote update timestamps for the same protection. Synchronization
writes are attributed to GitHub and do not trigger the existing status push
back to GitHub, preventing echo loops. Sidecar write failures are logged with
the issue-sync prefix while the rest of the webhook delivery continues.
