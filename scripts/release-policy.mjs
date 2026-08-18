#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function assertProductionRelease({ ref, requestedSha, checkoutSha, productionSha }) {
  if (ref !== "refs/heads/production") {
    throw new Error(`the release must be triggered from production, not ${ref || "an empty ref"}`);
  }
  for (const [label, sha] of Object.entries({ requestedSha, checkoutSha, productionSha })) {
    if (!SHA_PATTERN.test(sha)) throw new Error(`${label} is not a full Git SHA`);
  }
  if (checkoutSha !== requestedSha) {
    throw new Error(`checkout ${checkoutSha} differs from requested SHA ${requestedSha}`);
  }
  if (productionSha !== requestedSha) {
    throw new Error(`production ${productionSha} differs from requested SHA ${requestedSha}`);
  }
  return requestedSha;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requestedSha = process.argv[2] ?? "";
  assertProductionRelease({
    ref: process.env.GITHUB_REF ?? "",
    requestedSha,
    checkoutSha: git(["rev-parse", "HEAD"]),
    productionSha: git(["rev-parse", "origin/production"]),
  });
  console.log(`Release authorized on production ${requestedSha}`);
}
