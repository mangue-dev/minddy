---
{
  "id": "self-hosted-compatibility",
  "locale": "en",
  "title": "Select a supported release and installation profile",
  "summary": "Use an immutable release from the public mangue-dev/minddy repository.",
  "topic": "Operate an instance",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/en/self-hosted-compatibility-flow.svg",
      "alt": "Diagram: Annotated source tag. Assets and SHA256SUMS. Official OCI signature and digest. Selected compatibility profile.",
      "caption": "Read the stages in order. Annotated source tag. Assets and SHA256SUMS. Official OCI signature and digest. Selected compatibility profile.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow"
  ]
}
---

## Choose a profile {#self-hosted-compatibility}

Use an immutable release from the public mangue-dev/minddy repository. The v0.11.0 compatibility row supports Linux amd64 and arm64 production hosts, Node.js 24, pnpm 10.28.0, Docker Engine 27.0.0 or later and Compose plugin 2.29.0 or later. The full profile pins official Supabase self-hosted/v0.7.2 at commit 549db119c44c25167461812041ba198bde2b31a4. Keep its complete image set; upgrading one service separately creates an operator-managed variant.

The managed profile connects to a Supabase project on supabase.com. It must expose PostgreSQL, Auth, Storage and Realtime and pass the release verification. PostgreSQL alone is insufficient. The Supabase CLI local stack is for development and evaluation, not a public production service.


![Diagram: Annotated source tag. Assets and SHA256SUMS. Official OCI signature and digest. Selected compatibility profile.](/documentation/en/self-hosted-compatibility-flow.svg)

## Verify before execution {#verify-release}

Check the annotated tag, release assets, SHA256SUMS and official OCI signature before installing dependencies or executing the release. The following Bash commands start in the selected tagged checkout and leave IMAGE set to its verified digest. Stop on a failed check. Install Cosign using its official instructions first. The command preserves source and image identity; it does not prove the deployment works.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

## Plan operation and upgrades {#support}

Install one published release at a time. Migrations are forward-only; incompatible rollback restores a matching database, Storage, configuration and application set. Minddy maintains release tooling and offers best-effort diagnosis of reproducible core defects. You operate DNS, TLS, host capacity, backups, restore drills and optional providers. A moving image tag or derivative Supabase stack does not inherit the release support contract.

## Known runner limits in the published release {#known-runner-limits}

The published v0.11.0 runner has additional code-execution blockers: it rejects sandbox names with the allocation suffix, writes base64 file chunks larger than Linux permits in one environment value, and initializes a UID-10001, mode-0700 temporary store as root after dropping all capabilities. The last command can fail without its exit being checked, leaving the working directory absent. A healthy runner endpoint does not validate cloning or code execution. The current candidate corrects these paths; a disposable rehearsal used the current runner and storage helper as explicit read-only mounts on the v0.11.0 image. This does not produce a corrected published image or a new supported compatibility row. Obtain a corrected release/tooling combination and run the code-work acceptance checks before enabling code agents for a team.

The Git relay in v0.11.0 also omits the HTTP Basic challenge, preventing an ordinary Git client from sending its credentials. The [pinned engineering workaround](/docs/install-a-server#runner-workaround) supplies matching runner files and their checksums; it does not change the published image or create a supported release.

The published application image includes Node.js and Git but deliberately removes npm, npx and Corepack. The reference Compose profile also selects that image for workers through AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. This is insufficient for a fresh code worker: the OpenCode bootstrap uses npm to install its pinned runtime and plugin, even for a repository with no project dependencies. Without npm, execution stops at bootstrap; no project edit or test success can be inferred from the conversation. Use an operator-built and verified dedicated worker image with Node.js 24, npm, Git and the project’s required tools, selected by overriding AGENT_RUNNER_SANDBOX_IMAGE in the runner service. Keep the runner’s isolation constraints. Verify bootstrap, repository cloning, actual tests and the resulting diff before enabling code delegation. Fixing the runner files alone does not supply this worker toolchain.

The pinned storage helper also makes the sandbox workspace executable. Docker otherwise mounts this tmpfs with noexec, preventing the native OpenCode binary from starting and potentially surfacing a misleading musl-package fallback error. The correction retains nosuid, nodev, UID/GID 10001, mode 0700, read-only root filesystem, dropped capabilities and the disposable per-sandbox store. It does not grant executable access to host data or make the application image a suitable worker image.
