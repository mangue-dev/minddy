import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const containerArtifact = readFileSync(
  new URL("./add-container-release-artifact.mjs", import.meta.url),
  "utf8",
);
const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

test("keeps runtime email templates in the container build context", () => {
  assert.match(dockerignore, /^supabase\/\*$/m);
  assert.match(dockerignore, /^!supabase\/email-templates$/m);
  assert.match(dockerignore, /^!supabase\/email-templates\/\*\*$/m);
  assert.match(
    dockerfile,
    /COPY --from=build --chown=minddy:minddy \/app\/supabase\/email-templates \.\/supabase\/email-templates/,
  );
});

test("copies dependency patches before the frozen container install", () => {
  const patchCopyIndex = dockerfile.indexOf("COPY patches ./patches");
  const installIndex = dockerfile.indexOf("pnpm install --frozen-lockfile");

  assert.ok(patchCopyIndex >= 0);
  assert.ok(patchCopyIndex < installIndex);
  assert.match(dockerignore, /^\.deepsec$/m);
});

test("records the actual Cosign identity without the retired repository name", () => {
  assert.doesNotMatch(containerArtifact, /minddy-issues/);
  assert.match(containerArtifact, /COSIGN_CERTIFICATE_IDENTITY/);
  assert.match(containerArtifact, /COSIGN_CERTIFICATE_ISSUER/);
  assert.match(
    containerArtifact,
    /https:\/\/github\.com\/mangue-dev\/minddy\/\.github\/workflows\/release\.yml@refs\/heads\/production/,
  );
});

test("builds target-native dependencies and strips runtime package managers", () => {
  const nodeDigest = "sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205";
  assert.match(
    dockerfile,
    new RegExp(`^FROM node:24-bookworm-slim@${nodeDigest} AS base$`, "m"),
  );
  assert.match(dockerfile, new RegExp(`^FROM node:24-bookworm-slim@${nodeDigest} AS runtime$`, "m"));
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm \/usr\/local\/lib\/node_modules\/corepack/);
  assert.match(dockerfile, /rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/);
});

test("promotes OCI release tags only after scanning and signing the candidate digest", () => {
  assert.match(workflow, /candidate_tag=ghcr\.io\/\$\{GITHUB_REPOSITORY_OWNER,,\}\/minddy:candidate-\$SHA/);
  assert.match(workflow, /imagetools create --tag "\$CANDIDATE_TAG"/);
  assert.match(workflow, /scanners: vuln/);

  const buildIndex = workflow.indexOf("name: Publish signed-release candidate image");
  const scanIndex = workflow.indexOf("name: Enforce fixed high and critical vulnerability threshold");
  const signIndex = workflow.indexOf("name: Keylessly sign the OCI manifest");
  const promoteIndex = workflow.indexOf("name: Promote official OCI tags");
  const gitTagIndex = workflow.indexOf("name: Create annotated tag");

  assert.ok(buildIndex < scanIndex);
  assert.ok(scanIndex < signIndex);
  assert.ok(signIndex < promoteIndex);
  assert.ok(promoteIndex < gitTagIndex);
});

test("builds each architecture natively, untagged, and only after the release approval", () => {
  const authorizeIndex = workflow.indexOf("\n  authorize:\n");
  const imageIndex = workflow.indexOf("\n  image:\n");
  const publishIndex = workflow.indexOf("\n  publish:\n");
  assert.ok(authorizeIndex !== -1 && authorizeIndex < imageIndex && imageIndex < publishIndex);

  const authorize = workflow.slice(authorizeIndex, imageIndex);
  const image = workflow.slice(imageIndex, publishIndex);
  const publish = workflow.slice(publishIndex);

  // One approval gates the whole run: the gated job comes first and the other
  // two cannot start without it.
  assert.match(authorize, /environment: public-release/);
  assert.match(image, /needs: authorize/);
  assert.match(publish, /needs: \[authorize, image\]/);
  assert.doesNotMatch(image + publish, /environment:/);

  assert.match(image, /platform: linux\/amd64\n\s+arch: amd64\n\s+runner: ubuntu-24\.04\n/);
  assert.match(image, /platform: linux\/arm64\n\s+arch: arm64\n\s+runner: ubuntu-24\.04-arm\n/);
  assert.doesNotMatch(workflow, /setup-qemu-action/);
  assert.match(image, /push-by-digest=true/);
  assert.doesNotMatch(image, /^\s+tags:/m);

  // Only the publish job can write the repository, sign or attest.
  assert.doesNotMatch(authorize + image, /contents: write|id-token: write|attestations: write/);
  assert.match(publish, /for platform in linux\/amd64 linux\/arm64; do/);
});

test("requires the commit's main CI run instead of repeating its gates", () => {
  assert.match(workflow, /gh run list \\\n\s+--workflow ci\.yml \\\n\s+--branch main \\\n\s+--commit "\$RELEASE_SHA" \\\n\s+--event push \\\n\s+--status success/);
  assert.doesNotMatch(workflow, /pnpm run (lint|typecheck|test|build)\b/);
});
