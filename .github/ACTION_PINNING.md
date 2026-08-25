# Workflow and container pinning policy

Every external action or reusable workflow under `.github/workflows` must use
a full, lowercase 40-character commit SHA. Keep the corresponding release tag
in an inline comment so reviewers and Dependabot can identify the intended
version. Local actions (`./...`) are exempt because their implementation is
already part of the checked-out repository.

Every literal container image used by a workflow must include a lowercase
SHA-256 OCI digest. This includes `docker://` actions, job and service images,
and images passed to `docker run`. Keep the human-readable version tag before
the digest, for example `image:v1.2.3@sha256:...`. Runtime expressions are
allowed only when the producing step supplies an immutable digest.

Every external `FROM` image in the root `Dockerfile` must likewise keep its
readable tag and append the registry digest. References to an earlier named
build stage are internal and do not need a digest. Use the multi-platform index
digest when the release builds more than one architecture.

Dependabot checks GitHub Actions monthly and should open normal pull requests
for updates. Review each update as a supply-chain change:

1. Read the upstream release notes and compare the current and proposed commits.
2. Confirm that the proposed SHA belongs to the documented upstream release tag.
   For an annotated tag, use the peeled `^{}` commit, not the tag object:

   ```sh
   git ls-remote --tags https://github.com/OWNER/REPOSITORY.git \
     refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'
   ```

3. Update the full SHA and version comment together, then require the normal
   workflow review and CI checks. Do not replace the SHA with a branch, major
   tag, or floating release tag, including during emergency fixes.
4. If an update must be rolled back, restore the previously reviewed SHA and
   version comment in a reviewed pull request.

For container updates, inspect the tagged image in the source registry and
copy its published digest. Review the image release notes, then update the tag
and digest together. A tag without a digest is not an acceptable temporary
fallback.

Run `npm run check:workflow-action-pins` locally. It checks every workflow plus
the root `Dockerfile`. CI runs the same check before installing project
dependencies and rejects mutable external references or missing Action version
comments.
