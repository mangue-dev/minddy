/** Provider-owned remote endpoints, checked against the linked docs on 2026-09-04. */
export interface McpPreset {
  id: string;
  name: string;
  url: string;
  auth: "oauth" | "bearer" | "none";
  setup:
    | "standard"
    | "oauthApp"
    | "googlePreview"
    | "approvedClient"
    | "slackApp";
  docs: string;
}
const googleDocs =
  "https://developers.google.com/workspace/guides/configure-mcp-servers";
export const MCP_PRESETS: McpPreset[] = [
  {
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
  },
  {
    id: "linear",
    name: "Linear",
    url: "https://mcp.linear.app/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://linear.app/docs/mcp",
  },
  ...[
    ["gmail", "Gmail", "gmailmcp"],
    ["drive", "Google Drive", "drivemcp"],
    ["calendar", "Google Calendar", "calendarmcp"],
    ["docs", "Google Docs", "docsmcp"],
    ["sheets", "Google Sheets", "sheetsmcp"],
    ["slides", "Google Slides", "slidesmcp"],
    ["chat", "Google Chat", "chatmcp"],
    ["people", "Google Contacts", "people"],
  ].map(
    ([id, name, host]): McpPreset => ({
      id: `google-${id}`,
      name,
      url: `https://${host}.googleapis.com/mcp/v1`,
      auth: "oauth",
      setup: "googlePreview",
      docs: googleDocs,
    }),
  ),
  {
    id: "github",
    name: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    auth: "bearer",
    setup: "standard",
    docs: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server",
  },
  {
    id: "atlassian",
    name: "Atlassian (Jira, Confluence)",
    url: "https://mcp.atlassian.com/v2/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/",
  },
  {
    id: "slack",
    name: "Slack",
    url: "https://mcp.slack.com/mcp",
    auth: "oauth",
    setup: "slackApp",
    docs: "https://docs.slack.dev/ai/slack-mcp-server/",
  },
  {
    id: "figma",
    name: "Figma",
    url: "https://mcp.figma.com/mcp",
    auth: "oauth",
    setup: "approvedClient",
    docs: "https://developers.figma.com/docs/figma-mcp-server/",
  },
  {
    id: "asana",
    name: "Asana",
    url: "https://mcp.asana.com/v2/mcp",
    auth: "oauth",
    setup: "oauthApp",
    docs: "https://developers.asana.com/docs/integrating-with-asanas-mcp-server",
  },
  {
    id: "canva",
    name: "Canva",
    url: "https://mcp.canva.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://www.canva.dev/docs/mcp/",
  },
  {
    id: "sentry",
    name: "Sentry",
    url: "https://mcp.sentry.dev/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://mcp.sentry.dev/",
  },
  {
    id: "supabase",
    name: "Supabase",
    url: "https://mcp.supabase.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://supabase.com/docs/guides/ai-tools/mcp",
  },
  {
    id: "vercel",
    name: "Vercel",
    url: "https://mcp.vercel.com",
    auth: "oauth",
    setup: "standard",
    docs: "https://vercel.com/docs/agent-resources/vercel-mcp",
  },
  {
    id: "stripe",
    name: "Stripe",
    url: "https://mcp.stripe.com",
    auth: "oauth",
    setup: "standard",
    docs: "https://docs.stripe.com/mcp",
  },
];
