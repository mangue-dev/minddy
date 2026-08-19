# Changelog

Changes in minddy's public heart are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/lang/fr/).

Minddy Cloud and marketing-site deployments have their own operational log:
they create neither a version nor a tag of the public core.

## [Unreleased]

## [0.10.14] - 2026-08-19

### Fixed

- Public release validation and tag creation now authenticate every protected
  production-ref fetch with the workflow's ephemeral GitHub token.

## [0.10.13] - 2026-08-19

### Changed

- Prepared the consecutive target candidate after validating the protected
  production-promotion authentication fix.

## [0.10.12] - 2026-08-19

### Fixed

- Protected production promotion now authenticates its private-ref fetch with
  the workflow's ephemeral GitHub token.

## [0.10.11] - 2026-08-19

### Changed

- Prepared the consecutive target candidate used to validate the complete
  self-hosted update and restoration contract.

## [0.10.10] - 2026-08-19

### Fixed

- The self-hosted backup runbook now states the exact six-file SQL contract and
  uses consistent English operational instructions.

## [0.10.9] - 2026-08-19

### Added

- Candidate regression coverage requires the managed Supabase policy exporter
  in every release used by clean-room validation.

## [0.10.8] - 2026-08-19

### Fixed

- The self-hosting backup now exports and restores Storage and Realtime
  policies that the normal Supabase schema dump intentionally excludes.

## [0.10.7] - 2026-08-19

### Added

- Clean-room entry-point coverage now exercises the documented package-manager
  argument separator through a filesystem symlink.

## [0.10.6] - 2026-08-19

### Fixed

- The clean-room CLI now accepts the argument separator used by its documented
  `pnpm validate:self-hosted -- --…` commands.

## [0.10.5] - 2026-08-18

### Changed

- The prepublication runbook now gives the exact `deploy.sh` sequence that
  promotes an accepted source candidate before its target candidate.

## [0.10.4] - 2026-08-18

### Fixed

- `verify:supabase --local` now derives its Storage endpoint and service role
  from the running local stack, matching the documented clean-room command.

## [0.10.3] - 2026-08-18

### Added

- Regression coverage executes the clean-room CLI through a filesystem symlink
  before a candidate can pass CI.

## [0.10.2] - 2026-08-18

### Fixed

- Clean-room validation now starts through symlinked temporary paths and uses
  the native SHA-256 utility available on either Linux or macOS.

## [0.10.1] - 2026-08-18

### Changed

- Clean-room preflight reports now record both package manifest versions next
  to their immutable candidate refs and Git object identities.

## [0.10.0] - 2026-08-18

### Added

- Reproducible public release chain: source artifacts and migrations,
  SHA-256 checksums, CI provenance, release notes, and optional macOS releases
  without personal secrets.
- Clean-room self-hosting acceptance procedure and release-pair preflight for
  installation, optional-service isolation, upgrades, backups, and restoration.

## [0.9.5] - 2026-08-15

### Changed

- Last version released before the introduction of this structured changelog.

[Unreleased]: https://github.com/mangue-dev/minddy-issues/compare/v0.10.14...HEAD
[0.9.5]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.9.5

[0.10.0]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.0

[0.10.1]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.1

[0.10.2]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.2

[0.10.3]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.3

[0.10.4]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.4

[0.10.5]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.5

[0.10.6]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.6

[0.10.7]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.7

[0.10.8]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.8

[0.10.9]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.9

[0.10.10]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.10

[0.10.11]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.11

[0.10.12]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.12

[0.10.13]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.13

[0.10.14]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.14
