"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  MobileNavItem,
} from "mangue-ui";
import { NumoLauncherIcon } from "@/components/assistant/numo-launcher-icon";
import { useAssistantBusy, useAssistantUnreadResponseConversationId } from "@/lib/assistant-chat-context";
import { AppIcon } from "@/components/icon";
import { useAssistantPanel, useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useCreateActions } from "@/components/new-menu";

/**
 * Custom actions for the mobile bottom navbar (passed to <MobileNav actions>):
 * a Numo (assistant) launcher and a "+" create menu — the mobile replacements
 * for the desktop assistant FAB and the header "New" button. Rendered
 * between the navbar's Search and "More" buttons. Mirrors AutoKap's mobile nav.
 */
export function MobileNavActions() {
  const tk = useTranslations("Keyboard.shortcuts");
  const tn = useTranslations("Nav");
  const ta = useTranslations("Assistant");
  const { isOpen } = useAssistantPanel();
  const busy = useAssistantBusy();
  const unreadConversationId = useAssistantUnreadResponseConversationId();
  const unread = !!unreadConversationId && !isOpen && !busy;
  const numoLabel = unread ? `${tk("navAssistant")} — ${ta("unreadConversation")}` : tk("navAssistant");
  const { toggle, open } = useAssistantPanelActions();
  const actions = useCreateActions();

  return (
    <>
      {/* Numo — opens the full-bleed assistant panel. No context tag: the context of the page is read in the panel (the bullet
 above the composer), not on the button that opens it. */}
      <MobileNavItem
        label={numoLabel}
        onClick={() => {
          if (unread && unreadConversationId) open({ conversationId: unreadConversationId });
          else toggle();
        }}
      >
        {/* Static: an animation of SVG attributes looping on a navigation bar
 says nothing, and even runs hidden (MIN-323). */}
        <NumoLauncherIcon unread={unread} className="size-[22px] text-foreground" />
      </MobileNavItem>

      {/* Hairline divider (matches mangue-ui's internal PileDivider). */}
      <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />

      {/* "+" — create menu (issue / objective / project), opens upward. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MobileNavItem label={tn("new")}>
            <HugeiconsIcon icon={Add01Icon} className="size-[22px]" strokeWidth={2} />
          </MobileNavItem>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-52">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              <AppIcon icon={action.icon} />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
