# GitHub Action pinning policy

Every external action or reusable workflow under `.github/workflows` must use
a full, lowercase 40-character commit SHA. Keep the corresponding release tag
in an inline comment so reviewers and Dependabot can identify the intended
version. Local actions (`./...`) and container actions (`docker://...`) do not
use Git commit references and are exempt.

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

Run `npm run check:workflow-action-pins` locally. CI runs the same check before
installing project dependencies and rejects mutable external references.
