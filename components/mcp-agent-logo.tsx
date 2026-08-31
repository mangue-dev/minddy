"use client";

import type { ComponentType, SVGProps } from "react";
import {
  Claude,
  ClaudeCode,
  Codex,
  Cursor,
  Gemini,
  Windsurf,
} from "@lobehub/icons";
import { Bot } from "lucide-react";
import { cn } from "mangue-ui";
import type { McpAgentId } from "@/lib/mcp-agents";

type AgentLogoComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
  }
>;

const AGENT_LOGOS: Partial<Record<McpAgentId, AgentLogoComponent>> = {
  claude: ClaudeCode.Color,
  "claude-desktop": Claude.Color,
  codex: Codex,
  cursor: Cursor,
  gemini: Gemini.Color,
  windsurf: Windsurf,
};

const VSCODE_LOGO = "/agents/vscode.svg";

/**
 * Brand mark for an MCP client. The packaged icon set keeps third-party marks
 * identifiable without relying on mutable public asset URLs.
 */
export function McpAgentLogo({
  agent,
  size = 16,
  className,
}: {
  agent: McpAgentId | string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (agent === "vscode") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        aria-hidden
        alt=""
        src={VSCODE_LOGO}
        className={cn("shrink-0 object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const Logo = agent ? AGENT_LOGOS[agent as McpAgentId] : undefined;
  if (Logo) {
    return (
      <Logo
        aria-hidden
        focusable="false"
        size={size}
        className={cn("shrink-0", className)}
      />
    );
  }
  return (
    <Bot
      aria-hidden
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
