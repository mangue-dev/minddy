#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const DEFAULT_REPOSITORY = "mangue-dev/minddy";
const DEFAULT_REVIEWER = "mangue-dev";
const REQUIRED_CHECKS = new Set([
  "Analyze (actions)",
  "Analyze (c-cpp)",
  "Analyze (javascript-typescript)",
  "Dependencies audit",
  "Developer Certificate of Origin",
  "Tests & typecheck",
]);
const CODEQL_LANGUAGES = new Set(["actions", "c-cpp", "javascript-typescript"]);

function fail(message) {
  throw new Error(`GitHub repository policy mismatch: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...expected].every((item) => actual.has(item));
}

function containsSet(actual, expected) {
  return [...expected].every((item) => actual.has(item));
}

function api(repository, endpoint, { method = "GET", body, paginate = false } = {}) {
  const args = ["api", endpoint.replace("{repository}", repository)];
  if (method !== "GET") args.push("--method", method);
  if (paginate) args.push("--paginate", "--slurp");
  if (body !== undefined) args.push("--input", "-");
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    input: body === undefined ? undefined : `${JSON.stringify(body)}\n`,
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();
  if (!output) return null;
  const parsed = JSON.parse(output);
  return paginate ? parsed.flat() : parsed;
}

function ensureReleasePolicies(repository) {
  const endpoint = "repos/{repository}/environments/public-release/deployment-branch-policies";
  const policies = api(repository, endpoint).branch_policies;
  const required = [
    { name: "production", type: "branch" },
    { name: "v*", type: "tag" },
  ];
  for (const policy of required) {
    if (!policies.some((item) => item.name === policy.name && item.type === policy.type)) {
      api(repository, endpoint, { method: "POST", body: policy });
    }
  }
}

function apply(repository, reviewer) {
  const reviewerAccount = api(repository, `users/${reviewer}`);

  api(repository, "repos/{repository}", {
    method: "PATCH",
    body: {
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
      },
    },
  });
  api(repository, "repos/{repository}/private-vulnerability-reporting", { method: "PUT" });
  api(repository, "repos/{repository}/vulnerability-alerts", { method: "PUT" });
  api(repository, "repos/{repository}/automated-security-fixes", { method: "PUT" });
  api(repository, "repos/{repository}/actions/permissions", {
    method: "PUT",
    body: { enabled: true, allowed_actions: "selected", sha_pinning_required: true },
  });
  api(repository, "repos/{repository}/actions/permissions/workflow", {
    method: "PUT",
    body: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
  });
  api(repository, "repos/{repository}/actions/permissions/fork-pr-contributor-approval", {
    method: "PUT",
    body: { approval_policy: "all_external_contributors" },
  });
  api(repository, "repos/{repository}/environments/public-release", {
    method: "PUT",
    body: {
      wait_timer: 0,
      prevent_self_review: false,
      reviewers: [{ type: "User", id: reviewerAccount.id }],
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
      can_admins_bypass: false,
    },
  });
  ensureReleasePolicies(repository);
  const codeql = api(repository, "repos/{repository}/code-scanning/default-setup");
  if (
    codeql.state !== "configured"
    || codeql.query_suite !== "default"
    || !containsSet(new Set(codeql.languages), CODEQL_LANGUAGES)
  ) {
    api(repository, "repos/{repository}/code-scanning/default-setup", {
      method: "PATCH",
      body: {
        state: "configured",
        runner_type: "standard",
        query_suite: "default",
        threat_model: "remote",
        languages: [...CODEQL_LANGUAGES],
      },
    });
  }
}

function verifyRulesets(repository) {
  const summaries = api(repository, "repos/{repository}/rulesets", { paginate: true });
  const byName = new Map(summaries.map((ruleset) => [ruleset.name, ruleset]));
  assert(byName.has("Protect main"), "the Protect main ruleset does not exist");
  assert(byName.has("Protect production"), "the Protect production ruleset does not exist");
  const main = api(repository, `repos/{repository}/rulesets/${byName.get("Protect main").id}`);
  const production = api(
    repository,
    `repos/{repository}/rulesets/${byName.get("Protect production").id}`,
  );

  assert(main?.enforcement === "active", "the Protect main ruleset is not active");
  assert(main.conditions.ref_name.include.includes("refs/heads/main"), "main is not targeted");
  assert(main.bypass_actors.length === 0, "main has a bypass actor");
  const mainRules = new Map(main.rules.map((rule) => [rule.type, rule]));
  for (const type of ["deletion", "required_linear_history", "pull_request", "required_status_checks", "non_fast_forward"]) {
    assert(mainRules.has(type), `main is missing the ${type} rule`);
  }
  const pullRequest = mainRules.get("pull_request").parameters;
  assert(pullRequest.required_approving_review_count === 0, "main requires a fictitious second reviewer");
  assert(pullRequest.required_review_thread_resolution, "main does not require resolved conversations");
  assert(sameSet(new Set(pullRequest.allowed_merge_methods), new Set(["squash"])), "main allows a non-squash merge method");
  const checks = new Set(
    mainRules.get("required_status_checks").parameters.required_status_checks.map((check) => check.context),
  );
  assert(sameSet(checks, REQUIRED_CHECKS), "main required checks differ from the documented set");
  assert(
    mainRules.get("required_status_checks").parameters.strict_required_status_checks_policy,
    "main does not require an up-to-date branch",
  );

  assert(production?.enforcement === "active", "the Protect production ruleset is not active");
  assert(
    production.conditions.ref_name.include.includes("refs/heads/production"),
    "production is not targeted",
  );
  const productionRules = new Set(production.rules.map((rule) => rule.type));
  for (const type of ["update", "deletion", "required_linear_history", "non_fast_forward"]) {
    assert(productionRules.has(type), `production is missing the ${type} rule`);
  }
  assert(
    production.bypass_actors.length === 1
      && production.bypass_actors[0].actor_type === "DeployKey"
      && production.bypass_actors[0].bypass_mode === "always",
    "production is not restricted to the promotion deploy key class",
  );
}

function verify(repository, reviewer) {
  const repositorySettings = api(repository, "repos/{repository}");
  assert(repositorySettings.visibility === "public", "repository visibility is not public");
  assert(repositorySettings.default_branch === "main", "main is not the default branch");
  assert(repositorySettings.allow_squash_merge, "squash merge is disabled");
  assert(!repositorySettings.allow_merge_commit, "merge commits are enabled");
  assert(!repositorySettings.allow_rebase_merge, "rebase merges are enabled");
  assert(repositorySettings.delete_branch_on_merge, "merged branches are not deleted automatically");
  assert(
    repositorySettings.security_and_analysis?.secret_scanning?.status === "enabled",
    "secret scanning is disabled",
  );
  assert(
    repositorySettings.security_and_analysis?.secret_scanning_push_protection?.status === "enabled",
    "secret scanning push protection is disabled",
  );
  assert(
    repositorySettings.security_and_analysis?.dependabot_security_updates?.status === "enabled",
    "Dependabot security updates are disabled",
  );

  const privateReporting = api(repository, "repos/{repository}/private-vulnerability-reporting");
  assert(privateReporting.enabled, "private vulnerability reporting is disabled");
  const automatedFixes = api(repository, "repos/{repository}/automated-security-fixes");
  assert(automatedFixes.enabled && !automatedFixes.paused, "Dependabot automated security fixes are disabled or paused");

  const actions = api(repository, "repos/{repository}/actions/permissions");
  assert(actions.enabled, "GitHub Actions is disabled");
  assert(actions.allowed_actions === "selected", "GitHub Actions is not limited to selected actions");
  assert(actions.sha_pinning_required, "GitHub does not require full action SHA pins");
  const workflow = api(repository, "repos/{repository}/actions/permissions/workflow");
  assert(workflow.default_workflow_permissions === "read", "the default workflow token is writable");
  assert(!workflow.can_approve_pull_request_reviews, "workflow tokens can approve pull requests");
  const forkApproval = api(repository, "repos/{repository}/actions/permissions/fork-pr-contributor-approval");
  assert(
    forkApproval.approval_policy === "all_external_contributors",
    "not every external contributor requires workflow approval",
  );

  const environment = api(repository, "repos/{repository}/environments/public-release");
  assert(!environment.can_admins_bypass, "administrators can bypass public-release protection");
  const reviewRule = environment.protection_rules.find((rule) => rule.type === "required_reviewers");
  assert(reviewRule && !reviewRule.prevent_self_review, "public-release is incompatible with solo review");
  assert(
    reviewRule.reviewers.length === 1 && reviewRule.reviewers[0].reviewer.login === reviewer,
    `public-release is not reviewed only by ${reviewer}`,
  );
  assert(
    environment.deployment_branch_policy?.custom_branch_policies,
    "public-release does not use custom ref policies",
  );
  const policies = api(
    repository,
    "repos/{repository}/environments/public-release/deployment-branch-policies",
  ).branch_policies;
  const policySet = new Set(policies.map((policy) => `${policy.type}:${policy.name}`));
  assert(
    sameSet(policySet, new Set(["branch:production", "tag:v*"])),
    "public-release ref policies differ from production and v* tags",
  );

  const codeql = api(repository, "repos/{repository}/code-scanning/default-setup");
  assert(codeql.state === "configured", "CodeQL default setup is not configured");
  assert(codeql.query_suite === "default", "CodeQL does not use the documented query suite");
  assert(
    containsSet(new Set(codeql.languages), CODEQL_LANGUAGES),
    "CodeQL does not cover Actions, C/C++, and JavaScript/TypeScript",
  );

  verifyRulesets(repository);

  const secretAlerts = api(repository, "repos/{repository}/secret-scanning/alerts?state=open&per_page=100", {
    paginate: true,
  });
  assert(secretAlerts.length === 0, `${secretAlerts.length} secret-scanning alert(s) remain open`);
  const dependabotAlerts = api(repository, "repos/{repository}/dependabot/alerts?state=open&per_page=100", {
    paginate: true,
  }).filter((alert) => ["high", "critical"].includes(alert.security_advisory?.severity));
  assert(dependabotAlerts.length === 0, `${dependabotAlerts.length} high/critical Dependabot alert(s) remain open`);
  const codeScanningAlerts = api(repository, "repos/{repository}/code-scanning/alerts?state=open&per_page=100", {
    paginate: true,
  }).filter((alert) => ["high", "critical"].includes(alert.rule?.security_severity_level));
  assert(codeScanningAlerts.length === 0, `${codeScanningAlerts.length} high/critical code-scanning alert(s) remain open`);
}

const args = process.argv.slice(2);
const applyChanges = args[0] === "--apply";
if (applyChanges) args.shift();
const repository = args.shift() ?? process.env.MINDDY_GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
const reviewer = process.env.MINDDY_GITHUB_RELEASE_REVIEWER ?? DEFAULT_REVIEWER;
if (args.length > 0) fail(`unexpected argument: ${args[0]}`);

try {
  if (applyChanges) apply(repository, reviewer);
  verify(repository, reviewer);
  console.log(`GitHub repository controls verified for ${repository}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
