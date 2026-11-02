import { getTranslations } from "next-intl/server";
import { ApiIcon, Comment01Icon, CommentAdd01Icon, Copy01Icon, GitMergeIcon, PlugSocketIcon, SquareTerminalIcon } from "@hugeicons/core-free-icons";
import { MCP_ICON, PULL_REQUEST_ICON } from "@/components/feature-icons";
import { FeatureChapter } from "./feature-chapter";
import { IssueCommentFollowUp, IssuePullRequest, McpAgents, McpApps, WebhookLog } from "./figures/card-figures";
import { AgentTerminal, MergedPullRequest, PromptMenu } from "./figures/agent-figures";

/** minddy next to the tools you already use: coding agents, the forge and the apps Numo connects to. */
export async function SectionTools() {
  const t = await getTranslations("Landing");
  return (
    <FeatureChapter
      id="agents"
      eyebrow={t("toolsEyebrow")}
      title={t("toolsTitle")}
      lede={t("toolsLede")}
      className="bg-[#f4f6f9] dark:bg-[#12171d]"
      tone="sky"
      leadPoints={[
        {
          icon: Copy01Icon,
          title: t("toolsScene_prompt_title"),
          body: t("toolsScene_prompt_body"),
          shot: { node: <PromptMenu /> },
        },
        {
          icon: SquareTerminalIcon,
          title: t("toolsScene_work_title"),
          body: t("toolsScene_work_body"),
          shot: { node: <AgentTerminal /> },
        },
        {
          icon: GitMergeIcon,
          title: t("toolsScene_merge_title"),
          body: t("toolsScene_merge_body"),
          shot: { node: <MergedPullRequest /> },
        },
      ]}
      points={[
        {
          icon: MCP_ICON,
          title: t("tools_mcp_title"),
          body: t("tools_mcp_body"),
          shot: { node: <McpAgents /> },
        },
        {
          icon: PlugSocketIcon,
          title: t("tools_apps_title"),
          body: t("tools_apps_body"),
          shot: { node: <McpApps /> },
        },
        {
          icon: PULL_REQUEST_ICON,
          title: t("tools_pr_title"),
          body: t("tools_pr_body"),
          anchor: "workflow",
          shot: { card: "pull-request", crop: { x: 0, y: 0, w: 0.52 }, surface: true },
        },
        {
          icon: Comment01Icon,
          title: t("tools_review_title"),
          body: t("tools_review_body"),
          shot: { node: <IssuePullRequest /> },
        },
        {
          icon: CommentAdd01Icon,
          title: t("tools_followUp_title"),
          body: t("tools_followUp_body"),
          shot: { node: <IssueCommentFollowUp /> },
        },
        {
          icon: ApiIcon,
          title: t("tools_api_title"),
          body: t("tools_api_body"),
          shot: { node: <WebhookLog /> },
        },
      ]}
      aside={t("agentsPlanNote")}
    />
  );
}
