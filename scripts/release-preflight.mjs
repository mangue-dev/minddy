#!/usr/bin/env node

// Checks, before a protected approval is requested, the repository settings
// and release data that a publication workflow would otherwise discover
// missing after the promotion: an action outside the allowlist ends a workflow
// in `startup_failure`, and a missing secret fails a job minutes into its run.
// It reads names only, never a secret value.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appStoreVersion, assertReleaseCompatibility, assertVersion, xcodeMarketingVersions } from "./release-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GITHUB_OWNERS = new Set(["actions", "github"]);
// Every workflow receives this token without any configuration.
const BUILT_IN_SECRETS = new Set(["GITHUB_TOKEN"]);
// Reserved for the dormant WNS implementation: desktop-release.yml documents
// that both stay empty until it is activated.
const OPTIONAL_VARIABLES = new Set(["WINDOWS_WNS_APP_ID", "WINDOWS_WNS_OBJECT_ID"]);

export function workflowActionReferences(source) {
  const references = new Set();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/u);
    const reference = match?.[1] ?? match?.[2] ?? match?.[3];
    if (!reference || reference.startsWith("./") || reference.startsWith("docker://")) continue;
    references.add(reference);
  }
  return [...references];
}

export function isActionAllowed(reference, policy) {
  const [action] = reference.split("@");
  const owner = action.split("/")[0];
  if (policy.github_owned_allowed && GITHUB_OWNERS.has(owner)) return true;
  return (policy.patterns_allowed ?? []).some((pattern) => {
    if (pattern === reference) return true;
    if (!pattern.endsWith("*")) return false;
    return reference.startsWith(pattern.slice(0, -1));
  });
}

export function workflowJobs(source) {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  if (start === -1) return [];
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/u);
    if (header) {
      jobs.push({ id: header[1], lines: [] });
    } else if (jobs.length > 0) {
      jobs.at(-1).lines.push(line);
    }
  }
  return jobs.map(({ id, lines: body }) => {
    const text = body.join("\n");
    return {
      id,
      environment: text.match(/^ {4}environment:\s*([A-Za-z0-9_-]+)\s*$/mu)?.[1] ?? null,
      secrets: [...new Set([...text.matchAll(/\bsecrets\.([A-Z][A-Z0-9_]*)/gu)].map((match) => match[1]))]
        .filter((name) => !BUILT_IN_SECRETS.has(name)),
      variables: [...new Set([...text.matchAll(/\bvars\.([A-Z][A-Z0-9_]*)/gu)].map((match) => match[1]))]
        .filter((name) => !OPTIONAL_VARIABLES.has(name)),
    };
  });
}

// `workflows` maps a file name to its source. `configured` lists the secret
// and variable names set on the repository and on each environment.
export function findSettingsProblems({ workflows, actionsPolicy, configured }) {
  const problems = [];
  for (const [file, source] of Object.entries(workflows)) {
    if (actionsPolicy) {
      for (const reference of workflowActionReferences(source)) {
        if (!isActionAllowed(reference, actionsPolicy)) {
          problems.push({
            message: `${file}: ${reference} is not in the Actions allowlist; the workflow would end in startup_failure`,
          });
        }
      }
    }
    for (const job of workflowJobs(source)) {
      const scopes = [configured.repository, configured.environments[job.environment]].filter(Boolean);
      const missing = [
        ...job.secrets.filter((name) => !scopes.some((scope) => scope.secrets.includes(name))).map((name) => `secret ${name}`),
        ...job.variables.filter((name) => !scopes.some((scope) => scope.variables.includes(name))).map((name) => `variable ${name}`),
      ];
      if (missing.length === 0) continue;
      problems.push({
        message: `${file} › ${job.id}: ${missing.join(", ")} not configured` +
          (job.environment ? ` in ${job.environment} or the repository` : " on the repository"),
      });
    }
  }
  return problems;
}

export function findVersionProblems({ version, packageVersion, desktopVersion, mobileVersion, iosVersions, compatibility, envExample, existingTags }) {
  const problems = [];
  const fail = (message) => problems.push({ message });
  try {
    assertVersion(version);
  } catch (error) {
    fail(error.message);
    return problems;
  }
  // The desktop and iOS apps follow the web's version (MIN-907); the App
  // Store reads its numbers only (appStoreVersion).
  const iosVersion = appStoreVersion(version);
  if (packageVersion !== version || desktopVersion !== version || mobileVersion !== version
    || iosVersions.length === 0 || iosVersions.some((value) => value !== iosVersion)) {
    fail(`package.json (${packageVersion}), desktop/package.json (${desktopVersion}), mobile/package.json (${mobileVersion}) and the iOS MARKETING_VERSION (${iosVersions.join(", ") || "none"}) must all declare ${version}; prepare the release in a pull request`);
  }
  if (existingTags.includes(`v${version}`)) fail(`tag v${version} already exists; a published version is never reused`);
  try {
    assertReleaseCompatibility(compatibility, version);
  } catch (error) {
    fail(error.message);
  }
  const expected = [`MINDDY_RELEASE=${version}`, `MINDDY_IMAGE=ghcr.io/mangue-dev/minddy:v${version}`];
  const lines = envExample.split(/\r?\n/u);
  for (const line of expected) {
    if (!lines.includes(line)) fail(`deploy/self-hosted/.env.example must contain ${line}`);
  }
  return problems;
}

function gh(args) {
  return execFileSync("gh", args, { cwd: root, encoding: "utf8" }).trim();
}

function names(endpoint, key) {
  const output = gh(["api", "--paginate", `${endpoint}?per_page=100`, "--jq", `.${key}[].name`]);
  return output ? output.split("\n") : [];
}

function readConfigured(environments) {
  const scope = (base) => ({ secrets: names(`${base}/secrets`, "secrets"), variables: names(`${base}/variables`, "variables") });
  return {
    repository: scope("repos/{owner}/{repo}/actions"),
    environments: Object.fromEntries(
      environments.map((name) => [name, scope(`repos/{owner}/{repo}/environments/${name}`)]),
    ),
  };
}

function parseArguments(argv) {
  const options = { workflows: [], version: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--workflow") options.workflows.push(argv[++index]);
    else if (argv[index] === "--version") options.version = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (options.workflows.length === 0) {
    options.workflows = ["promote-production.yml", "release.yml", "desktop-release.yml"];
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const workflows = Object.fromEntries(
    options.workflows.map((file) => [file, read(path.join(".github/workflows", file))]),
  );
  const environments = [...new Set(
    Object.values(workflows).flatMap((source) => workflowJobs(source).map((job) => job.environment)).filter(Boolean),
  )];

  let problems;
  try {
    const permissions = JSON.parse(gh(["api", "repos/{owner}/{repo}/actions/permissions"]));
    const actionsPolicy = permissions.allowed_actions === "selected"
      ? JSON.parse(gh(["api", "repos/{owner}/{repo}/actions/permissions/selected-actions"]))
      : null;
    problems = findSettingsProblems({ workflows, actionsPolicy, configured: readConfigured(environments) });
  } catch (error) {
    console.error("Release preflight could not read the repository settings.");
    console.error("It needs an authenticated GitHub CLI with repository administration access.");
    console.error(String(error.stderr || error.message).trim());
    process.exit(1);
  }

  if (options.version) {
    const tags = execFileSync("git", ["tag", "--list", "v[0-9]*"], { cwd: root, encoding: "utf8" });
    problems.push(...findVersionProblems({
      version: options.version,
      packageVersion: JSON.parse(read("package.json")).version,
      desktopVersion: JSON.parse(read("desktop/package.json")).version,
      mobileVersion: JSON.parse(read("mobile/package.json")).version,
      iosVersions: xcodeMarketingVersions(read("mobile/ios/App/App.xcodeproj/project.pbxproj")),
      compatibility: JSON.parse(read("deploy/self-hosted/compatibility.json")),
      envExample: read("deploy/self-hosted/.env.example"),
      existingTags: tags.split("\n").filter(Boolean),
    }));
  }

  for (const problem of problems) console.error(`error: ${problem.message}`);
  if (problems.length > 0) process.exit(1);
  console.log(`Release preflight passed for ${options.workflows.join(", ")}${options.version ? ` and v${options.version}` : ""}.`);
}
