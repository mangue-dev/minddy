/** Provider-owned remote endpoints, checked against the linked docs on 2026-09-04 (Notion
 * through Stripe) and 2026-09-20 (everything after; each endpoint probed with an MCP
 * initialize handshake, each docs link resolved). */
export interface McpPreset {
  id: string;
  name: string;
  url: string;
  auth: "oauth" | "bearer" | "none";
  setup:
    | "standard"
    | "apiKey"
    | "oauthApp"
    | "googlePreview"
    | "approvedClient"
    | "slackApp";
  docs: string;
}
const googleDocs =
  "https://developers.google.com/workspace/guides/configure-mcp-servers";

/** Provider identity survives connection-specific query parameters. */
export function mcpPresetForUrl(raw: string): McpPreset | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  return MCP_PRESETS.find((preset) => {
    const candidate = new URL(preset.url);
    return (
      candidate.origin === url.origin &&
      candidate.pathname.replace(/\/+$/, "") === url.pathname.replace(/\/+$/, "")
    );
  });
}
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
    setup: "apiKey",
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
    id: "posthog",
    name: "PostHog",
    url: "https://mcp.posthog.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://posthog.com/docs/model-context-protocol",
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
  {
    id: "hubspot",
    name: "HubSpot",
    url: "https://mcp.hubspot.com/",
    auth: "oauth",
    setup: "standard",
    docs: "https://developers.hubspot.com/mcp",
  },
  {
    id: "zapier",
    name: "Zapier",
    url: "https://mcp.zapier.com/api/v1/connect",
    auth: "bearer",
    setup: "apiKey",
    docs: "https://help.zapier.com/hc/en-us/articles/48308034391821-What-is-Zapier-MCP",
  },
  {
    id: "monday",
    name: "monday.com",
    url: "https://mcp.monday.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developer.monday.com/docs/mcp",
  },
  {
    id: "paypal",
    name: "PayPal",
    url: "https://mcp.paypal.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developer.paypal.com/ai-tools/mcp-server",
  },
  {
    id: "airtable",
    name: "Airtable",
    url: "https://mcp.airtable.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server",
  },
  {
    id: "webflow",
    name: "Webflow",
    url: "https://mcp.webflow.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developers.webflow.com/mcp",
  },
  {
    id: "wix",
    name: "Wix",
    url: "https://mcp.wix.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://dev.wix.com/docs/build-apps/develop-your-app/build-with-ai/wix-mcp",
  },
  {
    id: "gitlab",
    name: "GitLab",
    url: "https://gitlab.com/api/v4/mcp",
    auth: "bearer",
    setup: "apiKey",
    docs: "https://docs.gitlab.com/user/gitlab_mcp_server/",
  },
  {
    id: "grafana",
    name: "Grafana",
    url: "https://mcp.grafana.com/mcp",
    auth: "bearer",
    setup: "apiKey",
    docs: "https://github.com/grafana/mcp-grafana",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://huggingface.co/docs/hub/en/mcp",
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    url: "https://docs.mcp.cloudflare.com/mcp",
    auth: "none",
    setup: "standard",
    docs: "https://developers.cloudflare.com/agents/model-context-protocol/",
  },
  {
    id: "cloudflare-bindings",
    name: "Cloudflare Bindings",
    url: "https://bindings.mcp.cloudflare.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developers.cloudflare.com/agents/model-context-protocol/",
  },
  {
    id: "exa",
    name: "Exa",
    url: "https://mcp.exa.ai/mcp",
    auth: "none",
    setup: "standard",
    docs: "https://docs.exa.ai/reference/mcp",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    url: "https://mcp.dropbox.com/mcp",
    auth: "bearer",
    setup: "apiKey",
    docs: "https://developer.dropbox.com/docs/mcp",
  },
  {
    id: "intercom",
    name: "Intercom",
    url: "https://mcp.intercom.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developers.intercom.com/docs/guides/mcp",
  },
  {
    id: "box",
    name: "Box",
    url: "https://mcp.box.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developer.box.com/guides/box-mcp/",
  },
  {
    id: "clickup",
    name: "ClickUp",
    url: "https://mcp.clickup.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server",
  },
  {
    id: "square",
    name: "Square",
    url: "https://mcp.squareup.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://developer.squareup.com/docs/mcp",
  },
  {
    id: "ramp",
    name: "Ramp",
    url: "https://mcp.ramp.com/mcp",
    auth: "oauth",
    setup: "standard",
    docs: "https://docs.ramp.com/agent/mcp",
  },
];
