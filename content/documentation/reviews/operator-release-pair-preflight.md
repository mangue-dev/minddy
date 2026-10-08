# Self-hosting clean-room preflight — v0.10.30 to v0.11.0

- Generated: 2026-10-08T16:51:09.211Z
- Result: **BLOCKED**
- Validation mode: published releases
- Source ref: `v0.10.30`
- Source package version: `0.10.30`
- Source tag object: `5f9e352e0a5faed471a207fc395462cb2ca20791`
- Source commit: `9332261a186f57fc4fb2ab5406718d352aa19137`
- Target ref: `v0.11.0`
- Target package version: `0.11.0`
- Target tag object: `d324419aab1eb3c35cb342761b9e0d0bf1e3985e`
- Target commit: `62c02313363be7c09116c592d70019c51420d70a`

- [x] v0.10.30 is an annotated tag
- [x] v0.11.0 is an annotated tag
- [ ] v0.10.30 contains the clean-room contract
- [ ] v0.11.0 contains the clean-room contract
- [x] v0.10.30 is an ancestor of v0.11.0
- [x] the invoking shell has no optional Minddy Cloud service enabled

## Blocking findings

- Missing `v0.10.30:scripts/self-hosting-encryption.mjs`.
- Missing `v0.11.0:scripts/self-hosting-encryption.mjs`.


## Lifecycle evidence

Complete the commands and evidence table in `docs/self-hosting-clean-room.md` only after this preflight passes. A blocked preflight is not evidence that installation, update, or restoration succeeded.

## Historical contract scope

This blocked result describes the missing clean-room contract in the unchanged
published tags. It is not an observed installer failure. The subsequent
explicitly adapted lifecycle has separate records: `operator-upgrade-execution.json`,
`operator-adapted-clean-install.json` and `operator-adapted-tooling-restoration.json`.
Those records preserve the tag/image identities, exact adaptations, actual checks
and remaining limits rather than replacing this historical preflight result.
