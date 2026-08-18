# Minddy governance

This governance applies to the public core distributed under AGPL-3.0-only. She
does not govern the operation of the managed service or commercial contracts,
separated in accordance with [docs/licensing.md](docs/licensing.md).

## Roles

- **Contributor**: any person who reports, documents, reviews or proposes a
change. This role does not give any writing rights.
- **Reviewer**: regular contributor to whom a maintainer entrusts the review and
sorting on a domain. It recommends a decision but does not merge without
  explicit permission.
- **Maintainer**: person with sorting and merging rights. She
guarantees the scope, quality, security, licensing and consistency of
decisions. Maintainers own the code through
  [`.github/CODEOWNERS`](.github/CODEOWNERS).
- **Main maintainer**: responsible for the deposit and final arbiter when a
consensus is impossible. This role is currently held by
  [@mangue-dev](https://github.com/mangue-dev).

A maintainer can promote a reviewer or a maintainer after
sustained contributions, reliable reviews and demonstrated adherence to
project policies. The decision is announced publicly. The role can be
removed after six months of inactivity, at the request of the person, or for reasons
safety or conduct, with a public record when confidentiality requires it.
when confidentiality requires it.

## Propose and decide

1. Bugs and improvements go through the issue forms. A change
important (architecture, data, API, license, security or compatibility)
must be discussed and accepted before its implementation.
2. Ordinary decisions seek **lazy consensus**: in
the absence of a reasoned objection for three working days, a maintainer may
accept. A structuring decision remains open for at least seven days
calendars and records options, constraints and consequences.
3. An objection must propose a verifiable risk or alternative. THE
responsible maintainer summarizes the decision in the issue or the pull
request. In the event of persistent disagreement, the main maintainer decides and
   explains why.
4. A security emergency can be handled privately and merged without delay.
The decision and the publishable elements are recorded after the correction.

A person recuses himself when he has a direct financial interest, a conflict
personal or alone produced the disputed change. No author approves
its own pull request. Changes in license, commercial boundary or
of this governance require a dedicated outcome and the explicit agreement of the
main maintainer.

## Review and merge

Any external contribution arrives by pull request from a branch or a
fork. The maintainer starts by reading the diff, especially the scripts,
workflows, manifests and lockfiles, before authorizing CI execution. THE
Safety instructions are detailed in [CONTRIBUTING.md](CONTRIBUTING.md).

A pull request must have a coherent scope, an accepted outcome when the
change is not trivial, tests proportionate to the risk, a
up-to-date documentation, DCO-compliant commits and all green checks.
Owner code approval is required. An approval becomes invalid
after another significant push. The merger is done by **squash merge**; THE
title and body of the final commit must retain context and sign-off
COD. A maintainer can close a correct but out-of-strategy proposal or
impossible to maintain.

## GitHub branches and settings

`main` is the integration branch and `production` is the release branch.
Both refuse direct pushes and force-pushes. The expected rules
are versioned in [`.github/REPOSITORY_SETTINGS.md`](.github/REPOSITORY_SETTINGS.md).
They require in particular a pull request, a code owner review, resolution
conversations and these checks:

- `CI / Tests & typecheck` ;
- `CI / Dependency audit`;
- `DCO / Developer Certificate of Origin`.

Administrators follow the same rules, excluding emergency intervention
documented. Branches are deleted after merge and only squash merge
is permitted.

## Labels and sorting

Forms ask `bug` or `enhancement`. `documentation`, `dependencies`
and `security` describe the domain; `needs reproduction` indicates that a bug does not
cannot yet be confirmed; `breaking change` indicates an incompatibility;
`status: blocked` makes a dependency explicit. `good first issue` and
`help wanted` are only set if the scope and acceptance criteria
are sufficiently precise for external contribution.

## Dependencies

Dependabot offers npm updates for web applications every week and
desktop, and each month those of GitHub Actions. A dependency is not added
only if its necessity, maintenance, provenance and license are
compatible with [docs/licensing.md](docs/licensing.md). Updates
majors are never merged automatically. Any update goes through
the CI and the high/critical audit of the three lockfiles; an actionable alert is
prioritized according to its real impact and can follow the private security channel.
