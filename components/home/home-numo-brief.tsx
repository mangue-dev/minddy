"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChatMessage } from "@/components/assistant/chat-message";
import { Button } from "@/components/ui/button";
import type { AssistantMessage } from "@/lib/assistant-types";
import { markHomeBriefSeen, type HomeBrief } from "@/lib/use-home-brief-query";

/**
 * Numo's word on the home page (MIN-930), shown as Numo's own message at the
 * start of the home conversation: a few sentences that sum up its journal
 * (what waits for the user, what Numo did that touches their content, what
 * it offers to do on its own). Numo writes it in the background; the page
 * only reads it.
 *
 * It renders like any Numo answer, its mentions as live pills. The link under
 * it shows the conversation where Numo wrote its newest entry, in place of
 * the home conversation.
 *
 * Showing a version marks the journal entries it covers as seen, once per
 * version: the next word leaves out what was settled and treats the rest as
 * known.
 */
export function HomeNumoBrief({ brief, onOpenConversation }: {
  brief: HomeBrief;
  /** Show the conversation where Numo wrote its newest covered entry. */
  onOpenConversation: (conversationId: string) => void;
}) {
  const t = useTranslations("Home");
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === brief.id) return;
    // Seen means shown: a home page left open in a hidden tab has not been read.
    const mark = () => {
      if (document.visibilityState !== "visible" || seen.current === brief.id) return;
      seen.current = brief.id;
      void markHomeBriefSeen(brief.id);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [brief.id]);

  // Not a stored message: the word is Numo's opening of the conversation.
  const message = useMemo<AssistantMessage>(() => ({
    id: `home-brief-${brief.id}`,
    conversation_id: "",
    role: "assistant",
    content: brief.content,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    context: null,
    created_at: brief.generated_at,
  }), [brief.id, brief.content, brief.generated_at]);

  const conversationId = brief.conversation_id;
  const after: ReactNode = conversationId ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2.5 h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => onOpenConversation(conversationId)}
    >
      {t("numoBriefOpenConversation")}
    </Button>
  ) : null;

  return (
    <div data-testid="home-numo-brief">
      <ChatMessage message={message} afterContent={after} />
    </div>
  );
}
