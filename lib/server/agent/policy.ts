/** Capabilities are independent from the resources attached as context. */
export interface AgentExecutionPolicy {
  interaction: "interactive" | "unattended";
  repository: "read" | "write";
  delivery: "none" | "manual_pr" | "auto_pr";
  projectData: "read" | "write";
  /** Compatibility for legacy issue tools with an implicit target. */
  defaultIssueTarget: boolean;
}

export function executionPolicyFor(input: {
  hasIssueContext: boolean;
  reviewingPullRequest: boolean;
  unattended: boolean;
}): AgentExecutionPolicy {
  if (input.reviewingPullRequest) {
    return {
      interaction: input.unattended ? "unattended" : "interactive",
      repository: "read",
      delivery: "none",
      projectData: "read",
      defaultIssueTarget: input.hasIssueContext,
    };
  }
  return {
    interaction: input.unattended ? "unattended" : "interactive",
    repository: "write",
    delivery: input.unattended ? "auto_pr" : "manual_pr",
    projectData: "write",
    defaultIssueTarget: input.hasIssueContext,
  };
}
