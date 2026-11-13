"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NumoLauncherIcon } from "@/components/assistant/numo-launcher-icon";
import {
  useAssistantBusy,
  useAssistantUnreadAwaitsAnswer,
  useAssistantUnreadResponseConversationId,
} from "@/lib/assistant-chat-context";
import { AppIcon } from "@/components/icon";
import { useAssistantPanel, useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useCreateActions } from "@/components/new-menu";

// No focus style of its own, like the other slots (components/mobile-navigation.tsx).
const SLOT_CLASS = "flex h-full min-w-0 items-center justify-center rounded-full outline-none";

/** Numo and creation occupy fixed slots in the mobile bottom bar. */
export function MobileNumoButton() {
  const tk = useTranslations("Keyboard.shortcuts");
  const ta = useTranslations("Assistant");
  const { isOpen, fabSuppressed } = useAssistantPanel();
  const busy = useAssistantBusy();
  const unreadConversationId = useAssistantUnreadResponseConversationId();
  // Panel open, or a page showing the conversation (Home): nothing to signal.
  const unread = !!unreadConversationId && !isOpen && !fabSuppressed && !busy;
  const question = useAssistantUnreadAwaitsAnswer() && unread;
  const numoLabel = unread
    ? `${tk("navAssistant")} — ${ta(question ? "unreadQuestion" : "unreadConversation")}`
    : tk("navAssistant");
  const { toggle, open } = useAssistantPanelActions();

  return (
    <button type="button" data-mobile-numo-launcher data-nav-slot="assistant" data-nav-badge={unread ? "" : undefined} className={SLOT_CLASS} aria-label={numoLabel}
      onClick={() => {
        if (unread && unreadConversationId) open({ conversationId: unreadConversationId });
        else toggle();
      }}
    >
      {/* Static: an animation of SVG attributes looping on a navigation bar
 says nothing, and even runs hidden (MIN-323). */}
      <NumoLauncherIcon unread={unread} question={question} outlineWidth={3} className="size-[22px] text-foreground" />
    </button>
  );
}

export function MobileCreateButton() {
  const tn = useTranslations("Nav");
  const actions = useCreateActions();
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <button ref={createTrigger} type="button" data-nav-slot="create" aria-label={tn("new")} aria-haspopup="dialog" aria-expanded={createOpen}
        className={SLOT_CLASS}
        onClick={() => setCreateOpen(true)}>
        <HugeiconsIcon icon={Add01Icon} className="size-[22px]" />
      </button>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); createTrigger.current?.focus(); }}>
          <DialogTitle>{tn("new")}</DialogTitle>
          {actions.map((action) => <button type="button" key={action.key} disabled={action.disabled}
            data-mobile-sheet-row className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left hover:bg-control-hover disabled:opacity-50"
            onClick={() => { setCreateOpen(false); action.onSelect(); }}>
            <AppIcon icon={action.icon} />{action.label}
          </button>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
