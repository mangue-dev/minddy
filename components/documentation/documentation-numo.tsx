"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Sheet, SheetTitle, Spinner, Textarea } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { MobileSheetContent } from "@/components/ui/mobile-sheet";
import { useMobileLayout, useMobileViewport } from "@/lib/use-mobile-layout";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { NumoIcon } from "@/components/numo-icon";
import { NumoUsageExhaustedCard, parseNumoUsageExhausted } from "@/components/assistant/usage-exhausted-card";
import { visibleAssistantContent } from "@/lib/server/assistant/visible-content";
import type { Locale } from "@/i18n/config";
import { resolveDocumentationPath } from "@/lib/documentation-core.mjs";
import { MarkdownLink } from "@/components/markdown-link";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";

function HelpLink({ href, node: _node, ...props }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const { appUrl } = useRuntimeConfig();
  if (href) {
    try {
      const target = new URL(href, appUrl);
      if ((target.origin === new URL(appUrl).origin || target.origin === "https://minddy.app") && resolveDocumentationPath(target.pathname)) {
        return <Link {...props} href={target.pathname + target.search + target.hash} target="_self" className="markdown-link" />;
      }
    } catch { /* Malformed links fall back to the standard Markdown renderer. */ }
  }
  return <MarkdownLink href={href} {...props} />;
}

const HELP_LINKS = { a: HelpLink };

/** A private help conversation using Numo's durable runtime and account quota. */
export function DocumentationNumo({ open, onClose, articleId, locale }: {
  open: boolean; onClose: () => void; articleId: string | null; locale: Locale;
}) {
  const t = useTranslations("Documentation");
  const assistant = useTranslations("Assistant");
  const common = useTranslations("Common");
  const mobile = useMobileLayout() === true;
  useMobileViewport();
  const { state, sendMessage, reset, retry, abort } = useAssistantChat();
  const [draft, setDraft] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = ["streaming", "executing_tool", "generating_server"].includes(state.status);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [state.messages, state.streamingContent, open]);
  useEffect(() => {
    if (open && !mobile) input.current?.focus();
  }, [open, mobile]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !mobile) { onClose(); document.querySelector<HTMLElement>("[data-documentation-numo-launcher]")?.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, mobile, onClose]);
  const submit = () => {
    if (!draft.trim() || busy) return;
    void sendMessage(null, draft, { pageContext: { documentation: { articleId, locale } } });
    setDraft("");
  };
  const content = <div className="flex h-full min-h-0 flex-col">
    <div className={`flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 ${mobile ? "pr-14" : "pr-4"}`}>
      <NumoIcon state={busy ? "thinking" : "idle"} className="size-6" /><h2 className="text-sm font-medium">{t("numoHelp")}</h2>
      <Button variant="ghost" size="icon" className="ml-auto" aria-label={assistant("newConversation")} disabled={busy} onClick={() => { reset(); setDraft(""); input.current?.focus(); }}><HugeiconsIcon icon={Add01Icon} className="size-4" /></Button>
      {!mobile && <Button variant="ghost" size="icon" aria-label={common("close")} onClick={() => { onClose(); document.querySelector<HTMLElement>("[data-documentation-numo-launcher]")?.focus(); }}><HugeiconsIcon icon={Cancel01Icon} className="size-4" /></Button>}
    </div>
    <div ref={scroll} role="log" aria-label={t("numoHelp")} aria-live="polite" aria-busy={busy} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
      {!state.messages.length && <div className="py-6"><p className="font-medium">{t("numoWelcome")}</p><p className="mt-2 text-sm text-muted-foreground">{t("numoDescription")}</p></div>}
      {state.messages.filter(message => message.role === "user" || message.role === "assistant" && (message.content || parseNumoUsageExhausted(message.metadata))).map(message => {
        const usage = parseNumoUsageExhausted(message.metadata);
        return <Message key={message.id} from={message.role}><MessageContent>{usage ? <NumoUsageExhaustedCard details={usage} /> : <MessageResponse components={HELP_LINKS}>{visibleAssistantContent(message.content ?? "")}</MessageResponse>}</MessageContent></Message>;
      })}
      {state.streamingContent && <Message from="assistant"><MessageContent><MessageResponse components={HELP_LINKS} isAnimating>{visibleAssistantContent(state.streamingContent)}</MessageResponse></MessageContent></Message>}
      {busy && !state.streamingContent && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />{t("numoThinking")}</div>}
      {state.error && <div role="alert" className="space-y-2 text-sm"><p>{state.error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => {
        if (state.conversationId) { void retry(); return; }
        const message = state.messages.findLast(message => message.role === "user");
        if (message?.content) void sendMessage(null, message.content, { pageContext: message.context });
      }}>{assistant("retry")}</Button></div>}
    </div>
    <form className="shrink-0 space-y-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); submit(); }}>
      <Textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("numoQuestion")} placeholder={t("numoQuestion")} className="max-h-36 min-h-20 resize-none" maxLength={10000} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
      }} />
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{t("numoUsage")}</p>{busy
        ? <Button type="button" size="sm" variant="outline" onClick={abort}>{assistant("stop")}</Button>
        : <Button type="submit" size="sm" disabled={!draft.trim()}>{assistant("send")}</Button>}</div>
    </form>
  </div>;
  if (mobile) return <Sheet open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <MobileSheetContent side="bottom" id="documentation-numo" aria-describedby={undefined} className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 p-0" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>("[data-documentation-numo-launcher]")?.focus(); }}>
      <SheetTitle className="sr-only">{t("numoHelp")}</SheetTitle>{content}
    </MobileSheetContent>
  </Sheet>;
  return <aside id="documentation-numo" aria-label={t("numoHelp")} hidden={!open} className="fixed bottom-0 right-0 top-16 z-20 w-[24rem] border-l border-border bg-background">{content}</aside>;
}
