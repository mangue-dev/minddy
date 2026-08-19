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

## Run a release

Create a mode-`0600` environment file with the required application and
Supabase settings, then start the version you selected:

```bash
docker pull ghcr.io/mangue-dev/minddy:vX.Y.Z
docker run --detach --name minddy --restart unless-stopped \
  --env-file /etc/minddy/minddy.env \
  --publish 127.0.0.1:3000:3000 \
  ghcr.io/mangue-dev/minddy:vX.Y.Z
```

Place a TLS-terminating reverse proxy in front of the loopback port. Do not
publish the application directly to the Internet or put secrets in the image,
command line, or a committed Compose file.

## Verify a published image

Every GitHub Release attaches `minddy-vX.Y.Z-container.txt` and includes the
same image reference in `release-manifest.json`. Verify the release assets
first, then use its digest rather than trusting a tag lookup:

```bash
shasum -a 256 -c SHA256SUMS
export IMAGE='ghcr.io/mangue-dev/minddy'
export DIGEST='sha256:replace-with-the-release-digest'
```

The release workflow creates attached SPDX SBOM and SLSA provenance metadata,
issues a GitHub SLSA provenance attestation for the exact manifest digest, then
signs that digest with GitHub Actions OIDC. With
[Cosign](https://docs.sigstore.dev/cosign/installation/), verify the image
signature before running it:

```bash
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy-issues/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE@$DIGEST"
```

For public releases, verify the GitHub SLSA provenance record and extract the
registry-attached SPDX SBOM:

```bash
gh attestation verify "oci://$IMAGE@$DIGEST" --repo mangue-dev/minddy-issues
docker buildx imagetools inspect "$IMAGE@$DIGEST" \
  --format '{{ json .SBOM }}' > minddy-vX.Y.Z.sbom.spdx.json
test -s minddy-vX.Y.Z.sbom.spdx.json
```

The GitHub Release also has a GitHub artifact provenance attestation for its
source, migration, checksum, manifest, and container-identity assets. Verify
it with `gh attestation verify` as described in [releases.md](releases.md).

## Maintainer prerequisites

Before the first OCI publication, make the `minddy` GHCR package public and
grant the public repository's release workflow write access. The
`public-release` environment remains the approval boundary: its workflow token
needs `packages: write` and `id-token: write`, but no long-lived registry key.
