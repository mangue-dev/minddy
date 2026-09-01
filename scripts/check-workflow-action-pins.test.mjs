import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  findArtifactRetentionViolations,
  findActionPinningViolations,
  findDockerfileBaseImagePinningViolations,
  findWorkflowContainerPinningViolations,
} from "./check-workflow-action-pins.mjs";

test("artifact uploads require explicit bounded retention", () => {
  const digest = "a".repeat(40);
  const findings = findArtifactRetentionViolations(`
steps:
  - uses: actions/upload-artifact@${digest} # v4.6.2
    with:
      name: missing-retention
  - uses: actions/upload-artifact@${digest} # v4.6.2
    with:
      retention-days: 91
  - uses: actions/upload-artifact@${digest} # v4.6.2
    env:
      retention-days: 7
`);

  assert.deepEqual(
    findings.map(({ line, message }) => ({ line, message })),
    [
      {
        line: 3,
        message: "artifact upload must declare literal retention-days between 1 and 90",
      },
      {
        line: 6,
        message: "artifact upload must declare literal retention-days between 1 and 90",
      },
      {
        line: 9,
        message: "artifact upload must declare literal retention-days between 1 and 90",
      },
    ],
  );
});

test("artifact uploads accept explicit bounded retention", () => {
  const digest = "a".repeat(40);
  const findings = findArtifactRetentionViolations(`
steps:
  - uses: actions/upload-artifact@${digest} # v4.6.2
    with:
      name: evidence
      retention-days: "7"
`);

  assert.deepEqual(findings, []);
});

test("workflow action policy rejects mutable external references", () => {
  const findings = findActionPinningViolations(`
steps:
  - uses: actions/checkout@v5
  - uses: owner/action@main
  - uses: owner/action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`);

  assert.deepEqual(
    findings.map(({ line, reference, message }) => ({ line, reference, message })),
    [
      {
        line: 3,
        reference: "actions/checkout@v5",
        message: "external action must use a full commit SHA",
      },
      {
        line: 4,
        reference: "owner/action@main",
        message: "external action must use a full commit SHA",
      },
      {
        line: 5,
        reference: "owner/action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        message: "external action must include its release tag comment",
      },
    ],
  );
});

test("workflow action policy accepts annotated immutable and local references", () => {
  const findings = findActionPinningViolations(`
steps:
  - uses: "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09" # v5.1.0
  - uses: ./github/actions/local
`);

  assert.deepEqual(findings, []);
});

test("workflow container policy requires digests for action, job, service, and docker run images", () => {
  const actionFindings = findActionPinningViolations(`
steps:
  - uses: docker://alpine:3.22
`);
  const containerFindings = findWorkflowContainerPinningViolations(`
container: node:24-bookworm-slim
services:
  database:
    image: postgres:17
steps:
  - run: >-
      docker run --rm
      --volume "$GITHUB_WORKSPACE:/repo:ro"
      --workdir /repo
      ghcr.io/gitleaks/gitleaks:v8.30.1
      detect
`);

  assert.deepEqual(
    [...actionFindings, ...containerFindings].map(({ reference }) => reference),
    [
      "docker://alpine:3.22",
      "node:24-bookworm-slim",
      "postgres:17",
      "ghcr.io/gitleaks/gitleaks:v8.30.1",
    ],
  );
});

test("workflow container policy accepts literal digests and runtime expressions", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const actionFindings = findActionPinningViolations(`
steps:
  - uses: docker://alpine:3.22@${digest}
`);
  const containerFindings = findWorkflowContainerPinningViolations(`
container: node:24-bookworm-slim@${digest}
services:
  database:
    image: postgres:17@${digest}
steps:
  - run: docker run --rm ghcr.io/gitleaks/gitleaks:v8.30.1@${digest} detect
  - run: docker run --rm \${{ env.RUNTIME_IMAGE }} command
`);

  assert.deepEqual([...actionFindings, ...containerFindings], []);
});

test("Dockerfile policy requires external base-image digests and accepts internal stages", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const findings = findDockerfileBaseImagePinningViolations(`
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS unpinned
FROM node:24-bookworm-slim@${digest} AS base
FROM base AS build
`);

  assert.deepEqual(
    findings.map(({ line, reference }) => ({ line, reference })),
    [{ line: 2, reference: "node:24-bookworm-slim" }],
  );
});

test("release-surface workflows and Dockerfile satisfy the repository pinning policy", () => {
  const workflowFiles = [
    "ci.yml",
    "dco.yml",
    "desktop-release.yml",
    "promote-production.yml",
    "release.yml",
  ];
  const findings = [];

  for (const filename of workflowFiles) {
    const source = readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), "utf8");
    findings.push(...findActionPinningViolations(source, `.github/workflows/${filename}`));
    findings.push(...findArtifactRetentionViolations(source, `.github/workflows/${filename}`));
    findings.push(...findWorkflowContainerPinningViolations(source, `.github/workflows/${filename}`));
  }

  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  findings.push(...findDockerfileBaseImagePinningViolations(dockerfile));

  assert.deepEqual(findings, []);
});
