# Public heart border

The public repository contains the Minddy product which can be run or
self-host. It does not contain Minddy Cloud service operations. A
function stays in core when serving a user of an instance,
even when triggered in the background. A function whose only
consumer is the team that operates `minddy.app` must live out of this repository.

## Inventory and decision

| Area | Owner | Destination | Decision |
| --- | --- | --- | --- |
| Collaborative product, project notifications, mentions, agents, routines and automations | Community/Instance Administrator | Public Heart | Retained: These are user features, not operational observability. |
| API and `/admin` panel, reading all accounts, tracking costs and global template settings | Instance Administrator | Public Heart | Kept: Access is controlled on the server side by role or `ADMIN_EMAILS`. No Minddy Cloud secrets are on board. |
| Plan gifts, manual overrides, quota resets and internal account marking | Instance Administrator | Optional commercial module | Retained: Support tools useful to an instance, including demo and capture accounts. |
| Brrr alerts for new registration and platform budget | Operating Minddy Cloud | Private Cloud Operations Repository | Withdrawn. These are not the notifications displayed to Minddy users. |
| Stripe, platform AI and their billing routes | Optional commercial module | Configuring the instance/commercial module | Retained as an option. `MINDDY_MANAGED_*` flags remain disabled without full configuration. |
| Managed forge relay control plane (GitHub App / GitLab OAuth credentials, webhook fan-out, instance registry) | Operating Minddy Cloud | Public Heart, gated to the Cloud edition | Kept in this repository because Minddy Cloud is deployed from it: the relay API ships behind `MINDDY_EDITION=cloud` + `MINDDY_MANAGED_FORGE=1`, like managed billing and AI. The core itself never depends on the relay: a self-hosted instance without an operator-owned app connects through it by DEFAULT (identity self-provisioned on first connect), `MINDDY_FORGE_RELAY=0` opts out entirely, and operator-owned apps keep precedence for new connections (docs/managed-forge-relay-plan.md). |
| Crons of routines, automations, retention, feedback, billing synchronization | Commercial product or module | Public core / commercial module | Retained: they perform functions requested by users. A platform plans them according to its own deployment. |
| `deploy.sh` and desktop app release | Instance Administrator | Public Heart | Preserved: A single wizard orchestrates isolated CI chains for core, cloud and desktop, without personal secrets or on-board administration endpoints. |
| IndexNow, backfills, inbox seed, avatar bucket and APN extraction | Occasional operation or maintenance Minddy Cloud | Private Cloud Operations Repository | Removed from public repository. |
| Audit documents, captures or machine/production specific parameters | Operating Minddy Cloud | Private repository of cloud operations or deletion | Ignored and refused by the publication barrier. |

## Verifiable contract

`npm run check:public-repo` is the release barrier. She rejects
paths, secrets and prohibited exploit markers in the index. The
CI runs it before any dependency installation. During development,
`node scripts/check-public-repo.mjs --worktree` applies the same rule to
working directory before adding to the index.

The barrier does not rewrite Git history: before the first release,
the maintainer must publish a sanitized story (or a new branch) if a
reachable revision contains a private secret or artifact. The control scans
already reachable objects for explicitly prohibited artifacts.

To add a capacity, first decide its line in this inventory. A
instance administration interface is public if it is protected and does not
depends on no secrets Minddy Cloud; operator-specific alerts and tools
remain in the private cloud operations repository.

## Destination Minddy Cloud

The operating scope is the private GitHub repository
`mangue-dev/minddy-cloud-ops`. It only receives the declarative configuration,
internal alerts and monitoring, Cloud backfills, procedures
incident reporting and support/CRM integrations. Its contract pins a complete SHA
of this core, the migration tree, the variable names, the planned jobs and
operator endpoints; its provenance links each production to the two SHAs.

This designation is informative, never a build dependency or
execution: a public clone does not read this repository, does not know any of its
secrets and maintains all the features necessary for self-hosting.
Any generic product or administration function born from a Cloud need is
first added here, in the public heart, then only consumed by the repository
of exploitation.
