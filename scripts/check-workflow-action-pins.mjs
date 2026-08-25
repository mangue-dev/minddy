#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const OCI_DIGEST = /@sha256:[0-9a-f]{64}$/;
const RELEASE_COMMENT = /#\s*v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?\s*$/;
const USES_LINE = /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/;
const IMAGE_LINE = /^\s*(?:image|container):\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/;
const DOCKER_RUN = /\bdocker\s+run(?:\s|$)/;
const IMAGE_REFERENCE = /^(?:[a-z0-9.-]+(?::\d+)?\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*(?::[A-Za-z0-9._-]+)?(?:@sha256:[0-9a-f]{64})?$/;

function finding(file, line, reference, message) {
  return { file, line, reference, message };
}

export function findActionPinningViolations(source, file = "<workflow>") {
  const findings = [];

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const match = line.match(USES_LINE);
    if (!match) continue;

    const reference = match[1] ?? match[2] ?? match[3];
    if (reference.startsWith("./")) continue;
    if (reference.startsWith("docker://")) {
      if (!OCI_DIGEST.test(reference.slice("docker://".length))) {
        findings.push(
          finding(file, index + 1, reference, "container action must use a sha256 digest"),
        );
      }
      continue;
    }

    const separator = reference.lastIndexOf("@");
    const revision = separator === -1 ? "" : reference.slice(separator + 1);
    if (!FULL_COMMIT_SHA.test(revision)) {
      findings.push(
        finding(file, index + 1, reference, "external action must use a full commit SHA"),
      );
    } else if (!RELEASE_COMMENT.test(line)) {
      findings.push(
        finding(file, index + 1, reference, "external action must include its release tag comment"),
      );
    }
  }

  return findings;
}

function dockerRunSource(lines, startIndex) {
  const indentation = lines[startIndex].match(/^\s*/)?.[0].length ?? 0;
  const command = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const currentIndentation = line.match(/^\s*/)?.[0].length ?? 0;
    if (index > startIndex && line.trim() && currentIndentation < indentation) break;
    if (
      index > startIndex &&
      currentIndentation === indentation &&
      /^\s*(?:-\s+)?[A-Za-z][\w-]*:\s/u.test(line)
    ) {
      break;
    }
    command.push(line.trim());
  }

  return command.join(" ");
}

function dockerRunImage(command) {
  const runIndex = command.search(DOCKER_RUN);
  if (runIndex === -1) return null;

  const tokens = command
    .slice(runIndex)
    .replace(/\$\{\{.*?\}\}/gu, "__GITHUB_EXPRESSION__")
    .split(/\s+/u)
    .slice(2);

  for (const token of tokens) {
    const normalized = token.replace(/^['"]|['"\\]$/gu, "");
    if (normalized === "__GITHUB_EXPRESSION__") return null;
    if (normalized.startsWith("-") || normalized.startsWith("$") || normalized.startsWith("/")) {
      continue;
    }
    if (IMAGE_REFERENCE.test(normalized)) return normalized;
  }

  return null;
}

export function findWorkflowContainerPinningViolations(source, file = "<workflow>") {
  const lines = source.split(/\r?\n/u);
  const findings = [];

  for (const [index, line] of lines.entries()) {
    const imageMatch = line.match(IMAGE_LINE);
    if (imageMatch) {
      const reference = imageMatch[1] ?? imageMatch[2] ?? imageMatch[3];
      if (!reference.includes("${{") && !OCI_DIGEST.test(reference)) {
        findings.push(
          finding(file, index + 1, reference, "workflow container must use a sha256 digest"),
        );
      }
    }

    if (!DOCKER_RUN.test(line.trim())) continue;
    const reference = dockerRunImage(dockerRunSource(lines, index));
    if (reference && !OCI_DIGEST.test(reference)) {
      findings.push(
        finding(file, index + 1, reference, "docker run image must use a sha256 digest"),
      );
    }
  }

  return findings;
}

export function findDockerfileBaseImagePinningViolations(source, file = "Dockerfile") {
  const findings = [];
  const stages = new Set();

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const match = line.match(/^\s*FROM(?:\s+--\S+)*\s+(\S+)(?:\s+AS\s+(\S+))?/iu);
    if (!match) continue;

    const [, reference, stage] = match;
    if (!stages.has(reference) && !OCI_DIGEST.test(reference)) {
      findings.push(
        finding(file, index + 1, reference, "external Docker base image must use a sha256 digest"),
      );
    }
    if (stage) stages.add(stage);
  }

  return findings;
}

async function checkWorkflows(workflowsDirectory) {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  const workflowFiles = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const findings = [];

  for (const filename of workflowFiles) {
    const absolutePath = path.join(workflowsDirectory, filename);
    const source = await readFile(absolutePath, "utf8");
    const file = `.github/workflows/${filename}`;
    findings.push(...findActionPinningViolations(source, file));
    findings.push(...findWorkflowContainerPinningViolations(source, file));
  }

  return findings;
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = await checkWorkflows(path.join(repositoryRoot, ".github", "workflows"));
  const dockerfile = await readFile(path.join(repositoryRoot, "Dockerfile"), "utf8");
  findings.push(...findDockerfileBaseImagePinningViolations(dockerfile));

  if (findings.length === 0) {
    console.log("All external workflow actions and container images are immutably pinned.");
    return;
  }

  for (const violation of findings) {
    console.error(
      `${violation.file}:${violation.line}: ${violation.reference}: ${violation.message}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
