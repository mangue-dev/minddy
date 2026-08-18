# Changelog

Changes in minddy's public heart are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/lang/fr/).

Minddy Cloud and marketing-site deployments have their own operational log:
they create neither a version nor a tag of the public core.

## [Unreleased]

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

[Unreleased]: https://github.com/mangue-dev/minddy-issues/compare/v0.10.1...HEAD
[0.9.5]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.9.5

[0.10.0]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.0

[0.10.1]: https://github.com/mangue-dev/minddy-issues/releases/tag/v0.10.1
