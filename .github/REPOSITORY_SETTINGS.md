# GitHub and Vercel repository settings

This file is the reproducible reference for settings that cannot be versioned.
After changing either provider, a maintainer must verify the corresponding API
or settings page and update the date and status below.

Last checked: September 1, 2026.

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
- GitHub Actions requires full commit SHA pins, gives workflow tokens read-only
  permissions by default, prevents them from approving pull requests, and
  requires approval before workflows from every external contributor run.
- CodeQL default setup scans Actions, C/C++, and JavaScript/TypeScript.
- Dependabot alerts, security updates, and automated security fixes are enabled.
- Every Actions artifact upload declares its retention explicitly: CI security
  evidence is kept for 7 days, cross-job intermediates for 1 day, and public
  release bundles for 30 days. GitHub Release assets remain the durable public
  distribution record.
- Secret scanning, push protection, and private vulnerability reporting are
  enabled. The only alert raised during activation was a deterministic scanner
  fixture and was resolved as `used_in_tests`; no operational credential was
  identified.
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
- GitHub is public, so repository rulesets and environment protection are
   available on the current plan.

## Active GitHub controls

1. The `main` ruleset applies to administrators and has no bypass actor. It:
   - requires every change to arrive through a squash-merged pull request;
   - requires resolved conversations and current successful
     `Tests & typecheck`, `Dependencies audit`,
     `Developer Certificate of Origin`, and CodeQL analyses for Actions, C/C++,
     and JavaScript/TypeScript from GitHub Actions;
   - requires linear history and prohibits deletion and force-pushes.
   The approving-review count is zero because this is a solo-maintained
   repository; the pull request, checks, DCO, and conversation trail remain
   mandatory.
2. The `production` ruleset applies to administrators and:
   - restricts every update to its bypass identity;
   - requires linear history and prohibits deletion and force-pushes;
   - grants bypass only to writable repository deploy keys. The repository has
     one such key, named `Minddy production promotion`.
3. The `cloud-production` environment:
   - requires approval from `mangue-dev`, allows self-review for the solo
     maintainer, and disallows administrator bypass;
   - accepts deployments only from `main`;
   - stores `PRODUCTION_DEPLOY_KEY`, whose public half is the sole writable
     deploy key. The workflow receives the private half only after approval and
     GitHub removes it during post-job cleanup;
   - requires the reviewer to inspect the stable security-report reference,
     residual risks, and pentest decision before approval.
4. Protect the `public-release` environment:
   - require approval from `mangue-dev`, allow self-review for the solo
     maintainer, and disallow administrator bypass;
   - allow deployments only from the `production` branch and `v*` tags;
   - keep publication credentials only in this environment.
5. In Actions → General, require approval for all external contributors. Never
   use `pull_request_target` to execute pull request code.
6. Keep CodeQL default setup enabled for Actions, C/C++, and
   JavaScript/TypeScript. Triage its alerts together with Dependabot and secret
   scanning; never dismiss a real credential as a test fixture.

## Reproduce and audit the GitHub controls

The repository settings script is the executable reference for the controls
above. It requires an authenticated GitHub CLI session with repository
administration and security-event access. To converge the security, Actions,
CodeQL, and `public-release` settings, then verify the complete policy:

```bash
npm run check:github-settings -- --apply mangue-dev/minddy
```

The apply mode is idempotent. It does not create or replace the `main` and
`production` rulesets owned by the promotion policy, and it does not delete
unexpected environment policies. A mismatch still fails the final audit so a
maintainer must review it deliberately. For the normal read-only audit, run:

```bash
npm run check:github-settings
```

The audit verifies repository visibility and merge policy, secret scanning and
push protection, private vulnerability reporting, Dependabot security updates
and automated fixes, Actions allowlisting and SHA enforcement, read-only
workflow tokens, external-contributor approval, CodeQL coverage, the two branch
rulesets without exclusions, the sole verified writable production deploy key,
the solo-compatible release approval, release ref restrictions, bounded
artifact retention, and the absence of open secret or high/critical dependency
and code-scanning alerts. It prints no secret values.

## Verification

1. Open a temporary pull request from a short-lived branch into `main`.
2. Confirm that an unsigned commit fails DCO and that merging stays blocked
   until CI, DCO, and conversation requirements pass.
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
