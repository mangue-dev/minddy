#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const USES_LINE = /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/;

export function findMutableActionReferences(source, file = "<workflow>") {
  const findings = [];

  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const match = line.match(USES_LINE);
    if (!match) continue;

    const reference = match[1] ?? match[2] ?? match[3];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;

    const separator = reference.lastIndexOf("@");
    const revision = separator === -1 ? "" : reference.slice(separator + 1);
    if (!FULL_COMMIT_SHA.test(revision)) {
      findings.push({ file, line: index + 1, reference });
    }
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
    findings.push(...findMutableActionReferences(source, `.github/workflows/${filename}`));
  }

  return findings;
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = await checkWorkflows(path.join(repositoryRoot, ".github", "workflows"));

  if (findings.length === 0) {
    console.log("All external workflow actions are pinned to full commit SHAs.");
    return;
  }

  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}: ${finding.reference} must use a full 40-character commit SHA`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
