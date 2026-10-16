"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { BotIcon } from "@hugeicons/core-free-icons";
import type { ComponentType } from "react";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color";
import Codex from "@lobehub/icons/es/Codex/components/Mono";
import Cursor from "@lobehub/icons/es/Cursor/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono";
import Windsurf from "@lobehub/icons/es/Windsurf/components/Mono";
import { cn } from "mangue-ui";
import type { McpAgentId } from "@/lib/mcp-agents";

type AgentLogoComponent = ComponentType<
  Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon"> & {
    size?: number | string;
  }
>;

const AGENT_LOGOS: Partial<Record<McpAgentId, AgentLogoComponent>> = {
  claude: ClaudeCodeColor,
  "claude-desktop": ClaudeColor,
  codex: Codex,
  cursor: Cursor,
  gemini: GeminiColor,
  // Monochrome mark (currentColor), like Windsurf.
  opencode: OpenCode,
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
    <HugeiconsIcon icon={BotIcon} aria-hidden className={cn("shrink-0", className)} style={{ width: size, height: size }} />
  );
}
