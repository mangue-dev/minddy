# Documentation figures with forge and push data

Four manual figures show screens whose data comes from a forge or a push
subscription that the demo account does not have:

| Figure | Screen |
| --- | --- |
| `forge-issue-sync-workflow` | Git card of the project settings, with a linked repository and issue sync off |
| `repository-skills-workflow` | Skill preview opened from a skill chip in the Numo composer |
| `devices-and-notifications-registered` | Push devices card listing one registered browser |
| `review-pull-requests-workflow` | Pull request viewer on its Changes tab |

These figures use **response-only demonstration data**. The script answers the
forge and push readings (`git-link`, `skills`, `push-subscriptions` and the
`/api/pull-requests` family) in the browser with demonstration JSON, for GET
requests only. **No forge call is made**: an unexpected pull request reading
gets a local 404 and is listed in the run record, never forwarded. Nothing is
written to the database: every non-GET request is blocked, except the app-tab
and local-snapshot bookkeeping the shell performs on navigation.

The demo repository is `aurora-labs/aurora`. The Aurora project id is resolved
at runtime from `GET /api/projects` (key `AUR`), so the script works against
both demo worlds. The skill description and instructions, the pull request
title and the stored device label are demo content written in the capture
locale; code in the diff stays as written. Headless Chromium reports
notifications as denied, so the page sees the permission as not yet asked; no
permission request is ever made.

Run one locale and one to three screens per batch, one browser at a time:

```sh
CAPTURE_LOCALES=en \
  DOC_CAPTURE_SCREENS=forge-issue-sync-workflow,devices-and-notifications-registered,review-pull-requests-workflow \
  node captures/shots/documentation-forge/shot.mjs
```

Captures are light mode, 2x, sRGB, framed by `captureDocumentationControl` with
transparent margins. The run record is written to
`output/documentation-captures/forge-captures.json`. Review every image before
publication: localized interface, populated data, nothing clipped, no spinner,
toast or error.
