# GitHub and Vercel repository settings

This file is the reproducible reference for settings that cannot be versioned.
After changing either provider, a maintainer must verify the corresponding API
or settings page and update the date and status below.

Last checked: August 26, 2026.

## Delivery topology

The required path is:

`feature/*` → pull request → `main` → `Promote production` → `production` →
Vercel GitHub Deployment `Production` → optional public `vX.Y.Z` tag

- `main` is the default branch and the only pull request target. CI and DCO must
  pass before a pull request can be squash-merged.
- `production` is not a development branch. It must reject human pushes,
  deletion, force-pushes, and history rewrites. The `Promote production`
  workflow is its only writer and only fast-forwards it to a green `main` SHA
  after approval in the `cloud-production` environment.
- `Public core release` runs from `production` and can tag only its exact SHA.
- Vercel treats only `production` as a production branch. `main` feeds
  `preview.minddy.app`; other work branches receive disposable previews.

## Verified live settings

The following settings were verified through the GitHub and Vercel APIs on the
date above:

- GitHub default branch: `main`.
- GitHub merge policy: squash merge enabled; merge commits and rebase merges
  disabled; merged branches are deleted automatically.
- GitHub Actions: enabled and restricted to selected actions.
- GitHub environments exist with the exact names `cloud-production`,
  `public-release`, `Preview`, and `Production`.
- Vercel project `mangue-dev/minddy` uses `production` as its sole production
  branch.
- `www.minddy.app` points to a successful production deployment whose Git ref
  is `production`.
- `preview.minddy.app` points to a preview deployment whose Git ref is `main`.
- Vercel creates GitHub Deployments named exactly `Production` and `Preview`.
  The promotion workflow polls the case-sensitive `Production` name.
- `VERCEL_DEEP_CLONE=1` is configured for both preview and production builds.

## Current GitHub plan prerequisite

The repository is currently private under a user-owned GitHub account without
GitHub Pro. GitHub returns HTTP 403 for both branch protection and repository
rulesets in this configuration. Environment protection rules also have no
required reviewers. Therefore, the branch and approval gates below are the
required target state but are **not yet enforceable**.

Do not claim the protected promotion path is active until the repository is
made public or the account is upgraded, the controls below are configured, and
the verification scenario passes. Changing repository visibility is a separate
owner decision; this runbook does not authorize it.

## Required GitHub controls once available

1. Protect `main`, including administrators:
   - require a pull request and one Code Owner approval;
   - dismiss stale approvals, require approval of the latest push by someone
     other than its author, and require all conversations to be resolved;
   - require a linear history and prohibit deletion, force-push, and bypass;
   - require current `CI / Tests & typecheck`, `CI / Dependency audit`, and
     `DCO / Developer Certificate of Origin` checks before merging.
2. Protect `production`, including administrators:
   - prohibit pull requests, direct human pushes, deletion, and force-push;
   - require a linear history;
   - grant the narrow write exception needed by `Promote production` only.
3. Protect the `cloud-production` environment:
   - require maintainer approval and disallow administrator bypass;
   - allow deployments only from `main`;
   - review the stable security-report reference, residual risks, and pentest
     decision before approving the workflow.
4. Protect the `public-release` environment:
   - require maintainer approval and disallow administrator bypass;
   - allow deployments only from `production` and protected `v*` tags;
   - keep publication credentials only in this environment.
5. In Actions → General, require approval for all external contributors. Never
   use `pull_request_target` to execute pull request code.
6. Enable private vulnerability reporting, secret scanning, and push
   protection when the repository plan or public visibility supports them.

## Verification after enabling the controls

1. Open a temporary pull request from a short-lived branch into `main`.
2. Confirm that an unsigned commit fails DCO and that merging stays blocked
   until CI, DCO, review, and conversation requirements pass.
3. Confirm that direct and force pushes to `production` fail for a maintainer.
4. Dispatch `Promote production` for a selected green `main` SHA. Confirm that
   approval is required, `production` advances by fast-forward to that exact
   SHA, and the workflow observes a successful GitHub Deployment named
   `Production` for the same SHA.
5. Confirm that `preview.minddy.app` still follows `main` and `www.minddy.app`
   follows `production`.

Any emergency exemption must be temporary, limited to the primary maintainer,
documented in an issue or security notice as soon as confidentiality permits,
and removed immediately after the incident.
