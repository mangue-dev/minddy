# GitHub issue synchronization

GitHub is the upstream source for a ticket linked through the GitHub App. The
`issues`, `issue_comment`, and `issue_dependencies` webhooks update minddy
automatically. Repeated deliveries are safe because GitHub delivery IDs and
remote comment identities are unique.

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
| Blocking dependencies | minddy `blocks` relations when both GitHub issues are imported in the same project |

GitHub-only data is stored in the `github_issue_sync_metadata` and
`github_issue_comment_syncs` sidecars instead of being encoded into the issue
description or categories. Enabling the repository link backfills comments and
provider-only issue metadata for the imported open issues. GitHub project
fields and uploaded file bytes have no native minddy equivalent; original
attachment URLs remain in the synchronized Markdown.

## Conflict and retry behavior

When GitHub supplies an `updated_at` timestamp, an older payload cannot
overwrite a newer local edit. The sidecar records the preceding GitHub sync, so
the local timestamp caused by that sync itself is not mistaken for a competing
edit. GitHub metadata and comments use the same remote timestamp protection.
Synchronization writes are attributed to GitHub and do not trigger the existing
status push back to GitHub, preventing echo loops. Sidecar and backfill failures
are logged with the issue-sync prefix while the remaining work continues.

## GitHub App requirements

The GitHub App needs `Issues: Read & write` and subscriptions to `Issues`,
`Issue comments`, and `Issue dependencies`. Existing installations must accept
new permissions after the App configuration changes.
