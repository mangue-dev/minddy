"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { useMentionHoverAvailable } from "@/components/mention-hover";
import { UserAvatar } from "@/components/user-avatar";

/**
 * Who an MCP agent acted for, on hover of its avatar or name in an activity
 * log (MIN-879). Laid out as a project's card: the agent's logo and name,
 * "MCP" where a project shows its key, then the person whose key it used —
 * their avatar and name, without a role.
 *
 * Everything comes from the activity line itself, so nothing is read. Like
 * mention cards, it shows only in the signed-in app.
 */
export function AgentHoverCard({
  agent,
  name,
  owner,
  children,
}: {
  /** The agent the key is attached to (Claude Code, Cursor…), if known. */
  agent: string | null | undefined;
  /** The agent's name, as the activity line shows it. */
  name: string;
  /** The person whose key the agent used. */
  owner: { name: string; avatarSeed: string } | null;
  /** One element that takes a ref. */
  children: ReactElement;
}) {
  const t = useTranslations("MentionPreview");
  const [open, setOpen] = useState(false);
  if (!useMentionHoverAvailable()) return children;
  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild onPointerDown={() => setOpen(false)}>{children}</HoverCardTrigger>
      <HoverCardContent className="cursor-default">
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Round, as the agent's avatar is everywhere in the activity. */}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <McpAgentLogo agent={agent} size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{t("mcpAgentKind")}</p>
            </div>
          </div>
          {owner && (
            <div className="flex min-w-0 items-center gap-2 border-t border-border pt-2.5 text-xs">
              <UserAvatar seed={owner.avatarSeed} className="size-5 shrink-0" />
              <span className="min-w-0 truncate">{owner.name}</span>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
