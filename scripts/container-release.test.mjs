import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
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

test("builds architecture-independent assets natively and strips runtime package managers", () => {
  const nodeDigest = "sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df";
  assert.match(
    dockerfile,
    new RegExp(`^FROM --platform=\\$BUILDPLATFORM node:24-bookworm-slim@${nodeDigest} AS base$`, "m"),
  );
  assert.match(dockerfile, new RegExp(`^FROM node:24-bookworm-slim@${nodeDigest} AS runtime$`, "m"));
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm \/usr\/local\/lib\/node_modules\/corepack/);
  assert.match(dockerfile, /rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/);
});

test("promotes OCI release tags only after scanning and signing the candidate digest", () => {
  assert.match(workflow, /candidate_tag=ghcr\.io\/\$\{GITHUB_REPOSITORY_OWNER,,\}\/minddy:candidate-\$SHA/);
  assert.match(workflow, /tags: \$\{\{ steps\.image\.outputs\.candidate_tag \}\}/);
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
