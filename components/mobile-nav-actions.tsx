"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NumoLauncherIcon } from "@/components/assistant/numo-launcher-icon";
import { useAssistantBusy, useAssistantUnreadResponseConversationId } from "@/lib/assistant-chat-context";
import { AppIcon } from "@/components/icon";
import { useAssistantPanel, useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useCreateActions } from "@/components/new-menu";

/** Numo and creation occupy fixed slots in the mobile bottom bar. */
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
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <button type="button" data-mobile-numo-launcher
        className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={numoLabel}
        onClick={() => {
          if (unread && unreadConversationId) open({ conversationId: unreadConversationId });
          else toggle();
        }}
      >
        {/* Static: an animation of SVG attributes looping on a navigation bar
 says nothing, and even runs hidden (MIN-323). */}
        <NumoLauncherIcon unread={unread} className="size-[22px] text-foreground" />
      </button>
      <button ref={createTrigger} type="button" aria-label={tn("new")} aria-haspopup="dialog" aria-expanded={createOpen}
        className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setCreateOpen(true)}>
        <HugeiconsIcon icon={Add01Icon} className="size-[22px]" strokeWidth={2} />
      </button>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); createTrigger.current?.focus(); }}>
          <DialogTitle>{tn("new")}</DialogTitle>
          {actions.map((action) => <button type="button" key={action.key} disabled={action.disabled}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left hover:bg-control-hover disabled:opacity-50"
            onClick={() => { setCreateOpen(false); action.onSelect(); }}>
            <AppIcon icon={action.icon} />{action.label}
          </button>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
