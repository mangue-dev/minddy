# Official OCI image

Each public minddy release publishes an official application image to GitHub
Container Registry:

```text
ghcr.io/mangue-dev/minddy:vX.Y.Z
```

The package name is deliberately stable even if the source repository is
renamed. Every release publishes its immutable `vX.Y.Z` tag. Stable releases
also update the `vX.Y` and `vX` convenience tags; those two aliases are mutable
and must never be used as a deployment pin. Use the digest recorded in the
corresponding GitHub Release when an immutable reference is required.

The image is a multi-platform OCI manifest for Linux `amd64` and `arm64`. Its
runtime is the traced Next.js standalone server on the Node.js slim base image,
runs as the unprivileged `minddy` user (UID 10001), and exposes port 3000. It
contains no operator configuration or secrets. Set the environment described
in [self-hosting.md](self-hosting.md) when starting it; changing a
`MINDDY_PUBLIC_*` setting requires a restart, not an image rebuild.
`/api/health` is a liveness endpoint for the container health check. It returns
`200 {"status":"ok"}` without contacting Supabase or an optional provider.

## Verify a published image

Before executing a release, install Git, curl, Node.js 24, pnpm 10.28.0 and
[Cosign](https://docs.sigstore.dev/cosign/installation/) using their official
installation instructions. Start in the root of the public checkout for the
annotated release tag you selected. If you do not have one yet:

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/mangue-dev/minddy.git minddy
cd minddy
```

Run these checks in Bash. They download all six core assets, verify every hash,
compare the annotated source tag with the manifest, and verify the OCI signature.
No dependency install or application execution belongs before these checks.

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

Stop if any command fails. Keep this shell open: `IMAGE` is now the verified
digest reference used by the installer and the run example below. Keep the
verified assets with your deployment records; do not replace the digest with a
mutable tag. The [two-release clean-room procedure](self-hosting-clean-room.md)
adds ancestry and update validation.

For public releases, verify GitHub SLSA provenance and extract registry-attached
SPDX metadata. These extra commands require the GitHub CLI and Docker Buildx:

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

The release also carries artifact provenance for source, migrations, checksums,
manifest and image identity. See [releases.md](releases.md) for verification.

## Run a verified release

Create a mode-`0600` environment with the required application and Supabase
settings, then use the verified `IMAGE` from the same shell:

```bash
docker pull "$IMAGE"
docker run --detach --name minddy --restart unless-stopped \
  --env-file /etc/minddy/minddy.env \
  --publish 127.0.0.1:3000:3000 \
  "$IMAGE"
```

Place a TLS-terminating reverse proxy in front of the loopback port. Do not
publish the application directly to the Internet or put secrets in the image,
command line, or a committed Compose file.
`/api/health` checks liveness without contacting Supabase or optional providers;
verify an actual account flow as well. The image build executes a native image
operation on each target architecture before publication.

## Maintainer prerequisites

Before the first OCI publication, make the `minddy` GHCR package public and
grant the public repository's release workflow write access. The
`public-release` environment remains the approval boundary: its workflow token
needs `packages: write` and `id-token: write`, but no long-lived registry key.
