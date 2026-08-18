# Public repository GitHub settings

This file is the reproducible reference for non-versionable settings. He doesn't
does not replace GitHub controls: after each modification, a maintainer
Check the Settings screen and update the date below.

Last checked: August 18, 2026, repository still private on GitHub plan
free. Industry protections and environmental approvals are
voluntarily deferred to MIN-388 until GitHub makes them applicable.
The workflows already describe the target path; no publication should be
announced before the settings below have been activated and tested.

## Settings already applicable

- Issues and Discussions activated; automatic deletion of branches after
  merger.
- **Squash merge only**; merge commits and rebase merge disabled.
- Actions limited to GitHub actions and `pnpm/action-setup@*`, with token in
read-only in pull request workflows.
- Dependency graph, Dependabot alerts and Dependabot security updates enabled.
- Labels: `bug`, `enhancement`, `documentation`, `dependencies`, `security`,
  `needs reproduction`, `breaking change`, `status: blocked`, `good first
issue` and `help wanted`.

## To be applied when publishing (MIN-388)

1. Enable **Private vulnerability reporting**, **Secret scanning** and **Push
protection** in Security → Code security and analysis.
2. In Actions → General, choose **Require approval for all external
contributors**. Never use `pull_request_target` to run the
code of a PR.
3. Protect `main`, administrators included:
- mandatory pull request, owner code approval and review;
- invalidate obsolete approvals, require approval from last push
by another person and resolve all conversations;
- prohibit deletion, force-push and circumvention;
- require a linear history;
- require `CI / Tests & typecheck`, `CI / Dependency audit` and
`DCO / Developer Certificate of Origin` updated before merging.
4. Protect `production` against deletion, force-push and human writing.
Keep the linear history and require the two SHA CI checks; TEA
workflow `Promote production` is the only direct write exception.
5. Create two GitHub environments:
- `cloud-production`, with approvers required, only allowed from
`main`, and the `Promote production` workflow as the only write path
to `production`. The approver opens the journal reference produced with
     [`docs/security-release-checklist.md`](../docs/security-release-checklist.md),
checks exceptions/residual risks and pentest decision before
to authorize the job;
- `public-release`, with approvers required, only allowed from
`production` and the protected tags `v*`, containing Apple secrets and
desktop flows described in `docs/releases.md`.
6. Verify that Vercel integration only follows `production` for the project
public and creates a GitHub Deployment named `Production` with its immutable URL.
7. Open a test pull request from a fork without trust history:
verify that the workflow is awaiting approval, that no secrets are exposed,
that a commit without sign-off fails and a maintainer cannot merge
until each rule is satisfied.
8. Check the form links, the **Report a vulnerability** button, the
Discussion categories and the creation of the first Dependabot PRs.

An emergency may require a temporary exemption. It is limited to
primary maintainer, documented in an issue or safety notice as soon as the
privacy permits, then the rules are reactivated immediately.
