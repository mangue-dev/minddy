import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReleaseCompatibility } from "./release-lib.mjs";
import {
  findSettingsProblems,
  findVersionProblems,
  isActionAllowed,
  workflowActionReferences,
  workflowJobs,
} from "./release-preflight.mjs";

const SHA = "c3c9e263c25d99ce0380d002d59b67737d91b0dc";
const WORKFLOW = `name: Example
on: workflow_dispatch
jobs:
  build:
    runs-on: ubuntu-latest
    environment: public-release
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: docker/build-push-action@${SHA} # v7.4.0
      - uses: ./local-action
      - run: publish
        env:
          TOKEN: \${{ secrets.BLOB_TOKEN }}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          FINGERPRINT: \${{ vars.LINUX_GPG_FINGERPRINT }}
          WNS: \${{ vars.WINDOWS_WNS_APP_ID }}
  macos:
    runs-on: macos-26
    environment: public-release
    steps:
      - run: sign
        env:
          KEY: \${{ secrets.APPLE_API_KEY_P8 }}
  plain:
    runs-on: ubuntu-latest
    steps:
      - run: echo done
`;

const policy = {
  github_owned_allowed: true,
  patterns_allowed: ["pnpm/action-setup@*", `docker/build-push-action@${SHA}`, "docker/login-action@v3"],
};

test("lists external actions once and skips local ones", () => {
  assert.deepEqual(workflowActionReferences(WORKFLOW), [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    `docker/build-push-action@${SHA}`,
  ]);
});

test("matches the allowlist by exact pin, wildcard or GitHub ownership", () => {
  assert.equal(isActionAllowed("actions/checkout@abc", policy), true);
  assert.equal(isActionAllowed(`docker/build-push-action@${SHA}`, policy), true);
  assert.equal(isActionAllowed("pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413", policy), true);
  // A tag pattern does not cover the commit that the tag points to.
  assert.equal(isActionAllowed("docker/login-action@dbcb813823bdd20940b903addbd779551569679f", policy), false);
  assert.equal(isActionAllowed("actions/checkout@abc", { ...policy, github_owned_allowed: false }), false);
});

test("reads each job's environment and referenced names", () => {
  assert.deepEqual(workflowJobs(WORKFLOW), [
    { id: "build", environment: "public-release", secrets: ["BLOB_TOKEN"], variables: ["LINUX_GPG_FINGERPRINT"] },
    { id: "macos", environment: "public-release", secrets: ["APPLE_API_KEY_P8"], variables: [] },
    { id: "plain", environment: null, secrets: [], variables: [] },
  ]);
});

test("accepts a workflow whose actions and names are all configured", () => {
  const problems = findSettingsProblems({
    workflows: { "release.yml": WORKFLOW },
    actionsPolicy: policy,
    configured: {
      repository: { secrets: ["APPLE_API_KEY_P8"], variables: [] },
      environments: { "public-release": { secrets: ["BLOB_TOKEN"], variables: ["LINUX_GPG_FINGERPRINT"] } },
    },
  });
  assert.deepEqual(problems, []);
});

test("blocks on an action outside the allowlist and on a missing secret", () => {
  const problems = findSettingsProblems({
    workflows: { "release.yml": WORKFLOW },
    actionsPolicy: { github_owned_allowed: true, patterns_allowed: [] },
    configured: {
      repository: { secrets: [], variables: [] },
      environments: { "public-release": { secrets: ["APPLE_API_KEY_P8"], variables: [] } },
    },
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0].message, /docker\/build-push-action@.* is not in the Actions allowlist/);
  assert.match(problems[1].message, /release\.yml › build: secret BLOB_TOKEN, variable LINUX_GPG_FINGERPRINT not configured/);
});

const compatibility = JSON.parse(
  readFileSync(new URL("../deploy/self-hosted/compatibility.json", import.meta.url), "utf8"),
);
const released = compatibility.entries.at(-1).minddyRelease;
const prepared = {
  version: released,
  packageVersion: released,
  desktopVersion: released,
  compatibility,
  envExample: `MINDDY_RELEASE=${released}\nMINDDY_IMAGE=ghcr.io/mangue-dev/minddy:v${released}\n`,
  existingTags: [],
};

test("adds nothing to the compatibility verdict for a fully prepared version", () => {
  // A published row may predate a raised Supabase floor, so the row's own
  // verdict is taken from the release library rather than assumed clean.
  let rowVerdict = [];
  try {
    assertReleaseCompatibility(compatibility, released);
  } catch (error) {
    rowVerdict = [error.message];
  }
  assert.deepEqual(findVersionProblems(prepared).map((problem) => problem.message), rowVerdict);
});

test("reports every release datum that the version bump left behind", () => {
  const problems = findVersionProblems({
    ...prepared,
    version: "99.0.0",
    envExample: "MINDDY_RELEASE=0.1.0\n",
    existingTags: ["v99.0.0"],
  }).map((problem) => problem.message);

  assert.equal(problems.length, 5);
  assert.match(problems[0], /must both declare 99\.0\.0/);
  assert.match(problems[1], /tag v99\.0\.0 already exists/);
  assert.match(problems[2], /exactly one row for minddy 99\.0\.0/);
  assert.match(problems[3], /MINDDY_RELEASE=99\.0\.0/);
  assert.match(problems[4], /MINDDY_IMAGE=ghcr\.io\/mangue-dev\/minddy:v99\.0\.0/);
});

test("rejects a version that is not SemVer before any other check", () => {
  const problems = findVersionProblems({ ...prepared, version: "next" });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /invalid SemVer version/);
});
