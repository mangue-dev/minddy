import type { ReviewThreadState } from "./pr-review-threads";

export type MergeMethod = "merge" | "squash" | "rebase";

export type MergeabilityReason =
  | "clean"
  | "checking"
  | "conflicts"
  | "checks"
  | "approval_required"
  | "changes_requested"
  | "unresolved_conversations"
  | "branch_out_of_date"
  | "draft"
  | "policy"
  | "unavailable";

export interface RepositoryMergePolicy {
  provider: "github" | "gitlab";
  available: boolean;
  methods: MergeMethod[];
  preferredMethod: MergeMethod | null;
  requiredApprovals: number | null;
  codeOwnerReviewRequired: boolean | null;
  conversationsMustBeResolved: boolean | null;
  checksMustPass: boolean | null;
  requiredCheckNames: string[] | null;
  branchMustBeUpToDate: boolean | null;
  linearHistoryRequired: boolean | null;
  mergeQueueRequired: boolean | null;
  autoMergeAllowed: boolean | null;
  unavailableReason?: "forbidden" | "unknown";
}

export interface ReadinessCheck {
  name: string;
  state: "pending" | "success" | "failure" | "neutral";
  required: boolean | null;
}

export type ReadinessBlockerKind =
  | "mergeability"
  | "draft"
  | "checks"
  | "changes_requested"
  | "approvals"
  | "conversations"
  | "branch"
  | "conflicts"
  | "policy";

export type ReadinessAction =
  | "mark_ready"
  | "approve"
  | "resolve_conversations"
  | "update_branch"
  | "rerun_checks"
  | "enable_auto_merge"
  | "open_forge";

export interface ReadinessBlocker {
  id: string;
  kind: ReadinessBlockerKind;
  required: boolean;
  status: "pending" | "blocked" | "unavailable";
  source:
    "pull_request" | "repository" | "reviews" | "conversations" | "checks";
  action: ReadinessAction;
  count?: number;
  expected?: number;
  checkNames?: string[];
}

export type ReadinessPassedConditionKind =
  | "mergeability"
  | "reviewable"
  | "checks"
  | "approvals"
  | "conversations"
  | "branch"
  | "policy";

export interface ReadinessPassedCondition {
  id: string;
  kind: ReadinessPassedConditionKind;
  required: boolean;
  source: ReadinessBlocker["source"];
  count?: number;
  expected?: number;
}

export type PullRequestReadinessState =
  | "ready"
  | "checks_running"
  | "changes_requested"
  | "approval_required"
  | "unresolved_conversations"
  | "branch_out_of_date"
  | "conflicts"
  | "policy_blocked"
  | "status_unavailable"
  | "draft"
  | "merged"
  | "closed";

export interface PullRequestReadiness {
  state: PullRequestReadinessState;
  blockers: ReadinessBlocker[];
  passed: ReadinessPassedCondition[];
  mergeAllowed: boolean;
  methods: MergeMethod[];
  preferredMethod: MergeMethod | null;
}

export interface ReadinessInput {
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  mergeabilityReason: MergeabilityReason | null | undefined;
  policy: RepositoryMergePolicy | null;
  checks: ReadinessCheck[] | null;
  checksStatus: "loaded" | "loading" | "forbidden" | "unavailable";
  approvals: number | null;
  changesRequested: number | null;
  reviewThreads: ReviewThreadState[] | null;
  canWrite: boolean;
  mergeFlowActive?: boolean;
}

const PRIMARY_STATE: Record<ReadinessBlockerKind, PullRequestReadinessState> = {
  mergeability: "status_unavailable",
  draft: "draft",
  checks: "checks_running",
  changes_requested: "changes_requested",
  approvals: "approval_required",
  conversations: "unresolved_conversations",
  branch: "branch_out_of_date",
  conflicts: "conflicts",
  policy: "policy_blocked",
};

const BLOCKER_PRIORITY: ReadinessBlockerKind[] = [
  "mergeability",
  "draft",
  "checks",
  "changes_requested",
  "approvals",
  "conversations",
  "branch",
  "conflicts",
  "policy",
];

/**
 * Reduces provider data into the single readiness state rendered by the PR view.
 * Every independently known condition remains in `blockers`; the state is only
 * the highest-priority summary. Pending work intentionally takes precedence over
 * failures so a running suite never appears final.
 */
export function reducePullRequestReadiness(
  input: ReadinessInput,
): PullRequestReadiness {
  const methods = input.policy?.methods ?? [];
  const preferredMethod =
    input.policy?.preferredMethod &&
    methods.includes(input.policy.preferredMethod)
      ? input.policy.preferredMethod
      : (methods[0] ?? null);

  if (input.merged) {
    return {
      state: "merged",
      blockers: [],
      passed: [],
      mergeAllowed: false,
      methods,
      preferredMethod,
    };
  }
  if (input.state === "closed") {
    return {
      state: "closed",
      blockers: [],
      passed: [],
      mergeAllowed: false,
      methods,
      preferredMethod,
    };
  }

  const blockers: ReadinessBlocker[] = [];
  const add = (blocker: ReadinessBlocker) => {
    if (!blockers.some((existing) => existing.id === blocker.id))
      blockers.push(blocker);
  };

  if (input.draft || input.mergeabilityReason === "draft") {
    add({
      id: "draft",
      kind: "draft",
      required: true,
      status: "blocked",
      source: "pull_request",
      action: "mark_ready",
    });
  }

  if (!input.policy || !input.policy.available) {
    add({
      id: "policy-unavailable",
      kind: "mergeability",
      required: true,
      status: "unavailable",
      source: "repository",
      action: "open_forge",
    });
  }

  if (
    input.mergeabilityReason == null ||
    input.mergeabilityReason === "checking" ||
    input.mergeabilityReason === "unavailable"
  ) {
    add({
      id: "mergeability-unavailable",
      kind: "mergeability",
      required: true,
      status:
        input.mergeabilityReason === "checking" ? "pending" : "unavailable",
      source: "pull_request",
      action: "open_forge",
    });
  }

  if (input.mergeabilityReason === "conflicts") {
    add({
      id: "conflicts",
      kind: "conflicts",
      required: true,
      status: "blocked",
      source: "pull_request",
      action: "open_forge",
    });
  }
  if (input.mergeabilityReason === "branch_out_of_date") {
    add({
      id: "branch-out-of-date",
      kind: "branch",
      required: true,
      status: "blocked",
      source: "repository",
      action: "update_branch",
    });
  }
  if (input.mergeabilityReason === "policy") {
    add({
      id: "provider-policy",
      kind: "policy",
      required: true,
      status: "blocked",
      source: "repository",
      action: input.policy?.mergeQueueRequired
        ? "enable_auto_merge"
        : "open_forge",
    });
  }

  if (input.checksStatus === "loading") {
    add({
      id: "checks-loading",
      kind: "checks",
      required: true,
      status: "pending",
      source: "checks",
      action: "open_forge",
    });
  } else if (
    input.checksStatus === "forbidden" ||
    input.checksStatus === "unavailable"
  ) {
    add({
      id: "checks-unavailable",
      kind: "mergeability",
      required: true,
      status: "unavailable",
      source: "checks",
      action: "open_forge",
    });
  } else if (input.checks) {
    const pending = input.checks.filter((check) => check.state === "pending");
    const failedRequired = input.checks.filter(
      (check) => check.state === "failure" && check.required === true,
    );
    if (pending.length > 0) {
      add({
        id: "checks-pending",
        kind: "checks",
        required: pending.some((check) => check.required !== false),
        status: "pending",
        source: "checks",
        action: "open_forge",
        count: pending.length,
        checkNames: pending.map((check) => check.name),
      });
    }
    if (failedRequired.length > 0 || input.mergeabilityReason === "checks") {
      add({
        id: "checks-failed",
        kind: "checks",
        required: true,
        status: "blocked",
        source: "checks",
        action: "rerun_checks",
        count: failedRequired.length || undefined,
        checkNames: failedRequired.map((check) => check.name),
      });
    }
  }

  if (
    (input.changesRequested ?? 0) > 0 ||
    input.mergeabilityReason === "changes_requested"
  ) {
    add({
      id: "changes-requested",
      kind: "changes_requested",
      required: true,
      status: "blocked",
      source: "reviews",
      action: "open_forge",
      count: input.changesRequested ?? undefined,
    });
  }

  const requiredApprovals = input.policy?.requiredApprovals;
  if (
    (requiredApprovals != null && requiredApprovals > (input.approvals ?? 0)) ||
    input.mergeabilityReason === "approval_required"
  ) {
    add({
      id: "approvals-required",
      kind: "approvals",
      required: true,
      status: "blocked",
      source: "reviews",
      action: "approve",
      count: input.approvals ?? 0,
      expected: requiredApprovals ?? undefined,
    });
  }

  if (input.reviewThreads) {
    const unresolved = input.reviewThreads.filter(
      (thread) => !thread.resolved,
    ).length;
    if (unresolved > 0) {
      const required =
        input.policy?.conversationsMustBeResolved === true ||
        input.mergeabilityReason === "unresolved_conversations";
      add({
        id: "unresolved-conversations",
        kind: "conversations",
        required,
        status: required ? "blocked" : "pending",
        source: "conversations",
        action: "resolve_conversations",
        count: unresolved,
      });
    }
  }

  if (input.policy?.mergeQueueRequired && !input.mergeFlowActive) {
    add({
      id: "merge-queue",
      kind: "policy",
      required: true,
      status: "blocked",
      source: "repository",
      action: "enable_auto_merge",
    });
  }
  if (input.policy?.mergeQueueRequired && input.mergeFlowActive) {
    add({
      id: "merge-queue-active",
      kind: "policy",
      required: true,
      status: "pending",
      source: "repository",
      action: "open_forge",
    });
  }

  const genericPolicyIndex = blockers.findIndex(
    (blocker) => blocker.id === "provider-policy",
  );
  if (
    genericPolicyIndex >= 0 &&
    blockers.some(
      (blocker) =>
        blocker.id !== "provider-policy" &&
        blocker.kind !== "mergeability" &&
        blocker.required,
    )
  ) {
    blockers.splice(genericPolicyIndex, 1);
  }

  const pendingChecks = blockers.find(
    (blocker) => blocker.kind === "checks" && blocker.status === "pending",
  );
  const primary =
    pendingChecks ??
    BLOCKER_PRIORITY.flatMap((kind) =>
      blockers.filter((b) => b.kind === kind),
    )[0];
  const requiredBlocker = blockers.some((blocker) => blocker.required);
  const passed: ReadinessPassedCondition[] = [];
  const pass = (condition: ReadinessPassedCondition) => passed.push(condition);
  if (!input.draft && input.mergeabilityReason !== "draft") {
    pass({
      id: "reviewable",
      kind: "reviewable",
      required: true,
      source: "pull_request",
    });
  }
  if (input.mergeabilityReason === "clean") {
    pass({
      id: "mergeable",
      kind: "mergeability",
      required: true,
      source: "pull_request",
    });
  }
  if (input.policy?.available) {
    pass({
      id: "policy-readable",
      kind: "policy",
      required: true,
      source: "repository",
    });
  }
  if (input.checksStatus === "loaded" && input.checks) {
    const requiredChecks = input.checks.filter(
      (check) => check.required === true,
    );
    if (
      requiredChecks.every(
        (check) => check.state === "success" || check.state === "neutral",
      )
    ) {
      pass({
        id: "checks-passed",
        kind: "checks",
        required:
          input.policy?.checksMustPass === true || requiredChecks.length > 0,
        source: "checks",
        count: requiredChecks.length,
      });
    }
  }
  if (
    input.policy?.requiredApprovals != null &&
    input.policy.requiredApprovals > 0 &&
    (input.approvals ?? 0) >= input.policy.requiredApprovals
  ) {
    pass({
      id: "approvals-passed",
      kind: "approvals",
      required: true,
      source: "reviews",
      count: input.approvals ?? 0,
      expected: input.policy.requiredApprovals,
    });
  }
  if (input.policy?.conversationsMustBeResolved && input.reviewThreads) {
    if (input.reviewThreads.every((thread) => thread.resolved)) {
      pass({
        id: "conversations-passed",
        kind: "conversations",
        required: true,
        source: "conversations",
      });
    }
  }
  if (
    input.policy?.branchMustBeUpToDate &&
    input.mergeabilityReason === "clean"
  ) {
    pass({
      id: "branch-current",
      kind: "branch",
      required: true,
      source: "repository",
    });
  }
  return {
    state: primary ? PRIMARY_STATE[primary.kind] : "ready",
    blockers,
    passed,
    mergeAllowed:
      input.canWrite &&
      !requiredBlocker &&
      input.mergeabilityReason === "clean" &&
      methods.length > 0,
    methods,
    preferredMethod,
  };
}

export interface GithubRepositoryPolicyInput {
  allow_merge_commit?: boolean;
  allow_squash_merge?: boolean;
  allow_rebase_merge?: boolean;
  allow_auto_merge?: boolean;
}

export interface GithubBranchPolicyInput {
  required_status_checks?: {
    strict?: boolean;
    contexts?: string[];
    checks?: Array<{ context?: string }>;
  } | null;
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    require_code_owner_reviews?: boolean;
  } | null;
  required_conversation_resolution?: { enabled?: boolean } | null;
  required_linear_history?: { enabled?: boolean } | null;
}

export interface GithubRuleInput {
  type?: string;
  parameters?: {
    merge_method?: "MERGE" | "SQUASH" | "REBASE" | string;
    allowed_merge_methods?: Array<MergeMethod | string>;
    required_approving_review_count?: number;
    require_code_owner_review?: boolean;
    required_review_thread_resolution?: boolean;
    strict_required_status_checks_policy?: boolean;
    required_status_checks?: Array<{ context?: string }>;
  } | null;
}

export function mapGithubMergePolicy(
  repository: GithubRepositoryPolicyInput,
  branch: GithubBranchPolicyInput | null,
  rules: GithubRuleInput[] = [],
): RepositoryMergePolicy {
  const methods: MergeMethod[] = [];
  if (repository.allow_squash_merge) methods.push("squash");
  if (repository.allow_merge_commit) methods.push("merge");
  if (repository.allow_rebase_merge) methods.push("rebase");
  const ruleContexts =
    rules
      .find((rule) => rule.type === "required_status_checks")
      ?.parameters?.required_status_checks?.map((check) => check.context)
      .filter((context): context is string => !!context) ?? [];
  const branchContexts = [
    ...(branch?.required_status_checks?.contexts ?? []),
    ...(branch?.required_status_checks?.checks ?? [])
      .map((check) => check.context)
      .filter((context): context is string => !!context),
  ];
  const contexts = [...new Set([...branchContexts, ...ruleContexts])];
  const pullRequestRule = rules.find((rule) => rule.type === "pull_request");
  const allowedByRule =
    pullRequestRule?.parameters?.allowed_merge_methods?.filter(
      (method): method is MergeMethod =>
        method === "merge" || method === "squash" || method === "rebase",
    );
  const policyMethods = allowedByRule?.length
    ? methods.filter((method) => allowedByRule.includes(method))
    : methods;
  const mergeQueue = rules.find((rule) => rule.type === "merge_queue");
  const queueMethod = mergeQueue?.parameters?.merge_method?.toLowerCase() as
    MergeMethod | undefined;
  const queueMethods =
    queueMethod && policyMethods.includes(queueMethod)
      ? [queueMethod]
      : policyMethods;
  const branchApprovals =
    branch?.required_pull_request_reviews?.required_approving_review_count ?? 0;
  const rulesetApprovals =
    pullRequestRule?.parameters?.required_approving_review_count ?? 0;
  return {
    provider: "github",
    available: true,
    methods: queueMethods,
    preferredMethod: queueMethods[0] ?? null,
    requiredApprovals: Math.max(branchApprovals, rulesetApprovals),
    codeOwnerReviewRequired:
      (branch?.required_pull_request_reviews?.require_code_owner_reviews ??
        false) ||
      (pullRequestRule?.parameters?.require_code_owner_review ?? false),
    conversationsMustBeResolved:
      (branch?.required_conversation_resolution?.enabled ?? false) ||
      (pullRequestRule?.parameters?.required_review_thread_resolution ?? false),
    checksMustPass: contexts.length > 0,
    requiredCheckNames: contexts,
    branchMustBeUpToDate:
      (branch?.required_status_checks?.strict ?? false) ||
      (rules.find((rule) => rule.type === "required_status_checks")?.parameters
        ?.strict_required_status_checks_policy ??
        false),
    linearHistoryRequired:
      branch?.required_linear_history?.enabled ??
      rules.some((rule) => rule.type === "required_linear_history"),
    mergeQueueRequired: !!mergeQueue,
    autoMergeAllowed: repository.allow_auto_merge ?? false,
  };
}

export interface GitlabProjectPolicyInput {
  merge_method?: "merge" | "rebase_merge" | "ff" | string;
  squash_option?: "never" | "always" | "default_on" | "default_off" | string;
  only_allow_merge_if_pipeline_succeeds?: boolean;
  only_allow_merge_if_all_discussions_are_resolved?: boolean;
  approvals_before_merge?: number;
  merge_trains_enabled?: boolean;
  merge_train_enforcement?:
    | "allow_bypass"
    | "enforce_for_all_users"
    | "enforce_with_owner_override"
    | string;
}

export function mapGitlabMergePolicy(
  project: GitlabProjectPolicyInput,
): RepositoryMergePolicy {
  const squash = project.squash_option;
  const methods: MergeMethod[] =
    squash === "always"
      ? ["squash"]
      : squash === "never"
        ? ["merge"]
        : squash === "default_on"
          ? ["squash", "merge"]
          : ["merge", "squash"];
  const mergeTrainRequired =
    project.merge_trains_enabled === true &&
    (project.merge_train_enforcement === "enforce_for_all_users" ||
      project.merge_train_enforcement === "enforce_with_owner_override");
  return {
    provider: "gitlab",
    available: true,
    methods,
    preferredMethod: methods[0],
    requiredApprovals: project.approvals_before_merge ?? null,
    codeOwnerReviewRequired: null,
    conversationsMustBeResolved:
      project.only_allow_merge_if_all_discussions_are_resolved ?? false,
    checksMustPass: project.only_allow_merge_if_pipeline_succeeds ?? false,
    requiredCheckNames: null,
    branchMustBeUpToDate: project.merge_method === "rebase_merge" ? true : null,
    linearHistoryRequired:
      project.merge_method === "ff" || project.merge_method === "rebase_merge",
    // Enabling merge trains exposes the capability but still allows direct
    // merges by default. Only GitLab's enforcement setting makes the train a
    // repository requirement; older instances omit this field and therefore
    // retain their bypass behavior.
    mergeQueueRequired: mergeTrainRequired,
    autoMergeAllowed: true,
  };
}

export function unavailableMergePolicy(
  provider: "github" | "gitlab",
  reason: "forbidden" | "unknown",
): RepositoryMergePolicy {
  return {
    provider,
    available: false,
    methods: [],
    preferredMethod: null,
    requiredApprovals: null,
    codeOwnerReviewRequired: null,
    conversationsMustBeResolved: null,
    checksMustPass: null,
    requiredCheckNames: null,
    branchMustBeUpToDate: null,
    linearHistoryRequired: null,
    mergeQueueRequired: null,
    autoMergeAllowed: null,
    unavailableReason: reason,
  };
}

export function blockerFallbackUrl(
  provider: "github" | "gitlab",
  pullRequestUrl: string,
  blocker: Pick<ReadinessBlocker, "kind">,
): string {
  if (provider === "github") {
    if (blocker.kind === "conversations") return `${pullRequestUrl}/files`;
    if (blocker.kind === "checks") return `${pullRequestUrl}/checks`;
    if (blocker.kind === "conflicts") return `${pullRequestUrl}/conflicts`;
    return pullRequestUrl;
  }
  if (blocker.kind === "conversations") return `${pullRequestUrl}#notes`;
  if (blocker.kind === "checks") return `${pullRequestUrl}/pipelines`;
  if (blocker.kind === "conflicts") return `${pullRequestUrl}/conflicts`;
  if (blocker.kind === "branch")
    return `${pullRequestUrl}#merge-request-widget`;
  return pullRequestUrl;
}
