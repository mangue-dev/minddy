# Repository publication audit

Last reviewed: August 31, 2026. Scope: the complete canonical Git namespace,
the launch candidate tree, release material, licensing, bundled assets, example
data, documentation, support paths, and the boundary between the public core
and private managed operations.

This report records publication evidence. It is not legal advice and does not
replace credential revocation when a real credential is found.

## Current decision

**The retained-history blocker is cleared; publication still requires the exact
final candidate checks.**

The repository-controlled branches and tags were rewritten and pushed on
August 28, 2026. GitHub Support subsequently removed the affected pull-request
references, ran server-side garbage collection, and cleared the repository
cache. On August 31, a fresh disposable mirror of GitHub passed the complete
public-repository scan with 47 refs, 30,250 reachable objects, 17,154 blobs,
zero unexpected unreachable objects, and no finding. Its inventory SHA-256 was
`8e34b3b57e97f3c7e5f8fd9ab3dd4d76533d7ae11d25fcbf393ae2ff1ef9631c`.

The canonical repository and its GHCR package remain private. Do not change
either visibility until the exact final candidate has passed CI, artifact
verification, and another fresh remote scan.

## History rewrite evidence

The rewrite removed every historical version of these paths from all
repository-controlled branches and tags:

- `.claude/launch.json` and `.claude/settings.json`;
- `MIN-102-plan.md` and `MIN-184-plan.md`;
- `captures/world/world.md`;
- `copy-audit-landing.json`, `copy-audit-landing.md`, `copy-audit.json`,
  `copy-audit.md`, and `copy-fix-report.md`;
- `dev.log` and `problems.md`;
- `docs/audits/securite-2026-08-05.md`, `docs/desktop-signing.md`,
  `docs/harness-2026-08.md`, and
  `docs/rgpd/registre-des-traitements.md`;
- `scripts/indexnow.mjs` and `scripts/seed-inbox.mjs`.

Personal Gmail addresses in commit, tag, and file metadata were normalized to
the maintainer's GitHub noreply address. The rewrite was performed from a
verified mirror containing branches, tags, and GitHub pull-request refs. It
produced a 137-ref clean reconstruction with 29,871 reachable objects, no
forbidden path, no Gmail metadata, and no Gitleaks finding. The controlled
branch and tag update used exact force-with-lease values.

A verified pre-rewrite mirror and a separate bundle containing local-only
preflight tags are retained in the maintainer's restricted backup store. They
contain the retired private history, must never be published, and exist only
for incident recovery.

## Redacted finding ledger

The ledger intentionally contains no token, secret value, account identifier,
or credential fingerprint.

| Finding class | Classification | Required action | State |
| --- | --- | --- | --- |
| Two PEM delimiter fragments in historical `problems.md` blobs | Synthetic, escaped test examples. Reconstructed payloads are 66 bytes and cannot be parsed as private keys. | Remove from public history; no credential rotation. | Removed from controlled refs and GitHub-retained PR refs. |
| APNs delimiter in historical `scripts/extract-apns-secret.mjs` | Converter example, not a key payload; it cannot be parsed as a private key. | Remove the obsolete internal helper from public history. | Complete. |
| Provider-token and private-key samples in scanner/redaction tests | Deterministic, non-operational fixtures. | Keep narrow rule-and-path classifications; never exclude the test tree broadly. | Complete. |
| Identifier in historical `scripts/seed-inbox.mjs` | Account identifier, not an authentication credential. The script and identifier are unnecessary for distribution. | Remove every historical version. | Complete. |

No parseable private key or active token was found in the rewritten namespace.
The scanner output remains redacted; only aggregate evidence belongs in issue
tracking or this repository.

## GitHub retained-data cleanup

GitHub Support confirmed that it removed the affected pull-request references,
ran garbage collection, and cleared the repository cache. The required
post-cleanup disposable-mirror scan passed. Any future sensitive-data incident
must still follow the removal policy and treat exposed credentials as
compromised even when GitHub can remove retained objects.

## Current-tree publication review

| Area | Evidence | Decision |
| --- | --- | --- |
| License and notices | `LICENSE`, `NOTICE`, and `docs/licensing.md` record AGPL-3.0-only, the historical MIT notice, contributor identities, and the DCO policy. | Ready. |
| Public/private boundary | `docs/editions.md`, self-hosting documentation, and the licensing policy keep billing, fleet operations, support cases, and service-account administration outside the public core. | Ready. |
| Fonts | Inter ships with `app/fonts/LICENSE-Inter.txt`. | Ready. |
| Product and import choices | Agent marks come from the MIT-licensed `@lobehub/icons` package; import-provider marks come from the CC0-1.0-licensed `simple-icons` package. The VS Code stable icon comes from Microsoft's official brand download and is used only with its connection instructions. Product names and marks identify compatibility and do not imply endorsement. | Ready. |
| minddy brand | Logos and icons are maintained by the project copyright holder and excluded from the software trademark grant. | Ready. |
| Screenshots and capture fixtures | The tracked captures are generated from synthetic product fixtures and contain no production credential or internal endpoint. | Ready. |
| Dependencies | Lockfile audit, Dependabot, and the release container scan have no open fixed high or critical finding. | Recheck for the exact final candidate. |
| Documentation and support | README, self-hosting guides, contribution guide, code of conduct, confidential vulnerability reporting, support routes, and launch announcement are present and link-checked. | Ready. |

## Permanent controls

`scripts/check-public-repo.mjs` checks the index, worktree, full reachable
history, forbidden paths, and secret-shaped content. Remote mode builds a
disposable mirror and explicitly fetches GitHub pull-request, replacement, and
notes refs. The release workflow runs that remote mode before dependency
installation or repository scripts.

Gitleaks runs across all Git history with redacted output. Its policy inherits
the maintained provider-token, private-key, and high-entropy rules, plus the
project's internal-network and email-address rules. Classifications are narrow
rule-and-path pairs. There is no blanket test-tree exclusion.

Before the final visibility change:

1. retain the GitHub cleanup confirmation and passing fresh-mirror inventory;
2. build and publish one immutable private release candidate from the rewritten
   production SHA;
3. verify its source archives, manifests, checksums, OCI digest and signature,
   desktop artifacts, dependency results, and security probe;
4. record the exact version, commit SHA, tag object, OCI digest, and final
   namespace inventory in the launch-preflight issue.
