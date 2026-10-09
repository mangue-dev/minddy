"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, SendButtonWithCost, Sheet, SheetTitle, Spinner, Textarea } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, SquareIcon } from "@hugeicons/core-free-icons";
import { MobileSheetContent } from "@/components/ui/mobile-sheet";
import { useMobileLayout, useMobileViewport } from "@/lib/use-mobile-layout";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { NumoIcon } from "@/components/numo-icon";
import { NumoUsageExhaustedCard, parseNumoUsageExhausted } from "@/components/assistant/usage-exhausted-card";
import { visibleAssistantContent } from "@/lib/server/assistant/visible-content";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { DocumentationHelpResponse } from "./documentation-help-links";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { AgentBeam } from "@/components/agent-beam";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";

/** A private help conversation using Numo's durable runtime and account quota. */
export function DocumentationNumo({ open, onClose, articleId, sections, locale }: {
  open: boolean; onClose: () => void; articleId: string | null; locale: Locale;
  sections: DocumentationArticle["sections"];
}) {
  const t = useTranslations("Documentation");
  const assistant = useTranslations("Assistant");
  const common = useTranslations("Common");
  const { appUrl } = useRuntimeConfig();
  const helpContext = { appUrl, articleId, locale, sections };
  const mobile = useMobileLayout() === true;
  useMobileViewport();
  const { state, sendMessage, reset, retry, abort } = useAssistantChat();
  const [draft, setDraft] = useState("");
  const { ref: scroll, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = ["streaming", "executing_tool", "generating_server"].includes(state.status);
  useEffect(() => {
    if (open && !mobile) input.current?.focus({ preventScroll: true });
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
    <div className={`flex h-16 shrink-0 items-center gap-2 px-4 ${mobile ? "pr-14" : "pr-4"}`}>
      <NumoIcon state={busy ? "thinking" : "idle"} className="size-6" /><h2 className="text-sm font-medium">{t("numoHelp")}</h2>
      <AppTooltip label={assistant("newConversation")}><Button variant="ghost" size="icon" className="ml-auto" aria-label={assistant("newConversation")} disabled={busy} onClick={() => { reset(); setDraft(""); input.current?.focus(); }}><HugeiconsIcon icon={Add01Icon} className="size-4" /></Button></AppTooltip>
      <AppTooltip label={common("close")}><Button variant="ghost" size="icon" data-mobile-sheet-close={mobile ? "" : undefined} aria-label={common("close")} onClick={() => { onClose(); document.querySelector<HTMLElement>("[data-documentation-numo-launcher]")?.focus(); }}><HugeiconsIcon icon={Cancel01Icon} className="size-4" /></Button></AppTooltip>
    </div>
    <div className="relative min-h-0 flex-1">
      <div ref={scroll} onScroll={scrollProps.onScroll} role="log" aria-label={t("numoHelp")} aria-live="polite" aria-busy={busy} className="h-full space-y-5 overflow-y-auto overscroll-contain p-5 [overflow-anchor:none]">
        {!state.messages.length && <div className="py-6"><p className="font-medium">{t("numoWelcome")}</p><p className="mt-2 text-sm text-muted-foreground">{t("numoDescription")}</p></div>}
        {state.messages.filter(message => message.role === "user" || message.role === "assistant" && (message.content || parseNumoUsageExhausted(message.metadata))).map(message => {
          const usage = parseNumoUsageExhausted(message.metadata);
          return <Message key={message.id} from={message.role}><MessageContent className="chat-selectable">{usage ? <NumoUsageExhaustedCard details={usage} /> : <DocumentationHelpResponse {...helpContext} references={message.role === "assistant"}>{visibleAssistantContent(message.content ?? "")}</DocumentationHelpResponse>}</MessageContent></Message>;
        })}
        {state.streamingContent && <Message from="assistant"><MessageContent className="chat-selectable"><DocumentationHelpResponse {...helpContext} isAnimating>{visibleAssistantContent(state.streamingContent)}</DocumentationHelpResponse></MessageContent></Message>}
        {busy && !state.streamingContent && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />{t("numoThinking")}</div>}
        {state.error && <div role="alert" className="space-y-2 text-sm"><p>{state.error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => {
          if (state.conversationId) { void retry(); return; }
          const message = state.messages.findLast(message => message.role === "user");
          if (message?.content) void sendMessage(null, message.content, { pageContext: message.context });
        }}>{assistant("retry")}</Button></div>}
      </div>
      <ScrollFadeEdges edges={edges} from={mobile ? "from-card" : "from-background"} />
    </div>
    <form className="shrink-0 space-y-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); submit(); }}>
      <AgentBeam active={open && busy} keepMounted className="relative rounded-md">
        <Textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("numoQuestion")} placeholder={t("numoQuestion")} className="max-h-36 min-h-24 resize-none pb-12" maxLength={10000} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
        }} />
        {busy
          ? <Button type="button" size="icon" className="absolute bottom-2 right-2 size-8 rounded-full" aria-label={assistant("stop")} onClick={abort}><HugeiconsIcon icon={SquareIcon} className="size-3 fill-current" aria-hidden /></Button>
          : <div className="absolute bottom-2 right-2"><SendButtonWithCost cost={null} isLoading={false} disabled={!draft.trim()} onClick={submit} ariaLabel={assistant("send")} tooltipLabel={assistant("send")} /></div>}
      </AgentBeam>
      <p className="text-center text-xs text-muted-foreground">{t("numoUsage")}</p>
    </form>
  </div>;
  if (mobile) return <Sheet open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <MobileSheetContent showCloseButton={false} side="bottom" id="documentation-numo" aria-describedby={undefined} className="documentation-numo-sheet flex flex-col gap-0 p-0" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>("[data-documentation-numo-launcher]")?.focus(); }}>
      <SheetTitle className="sr-only">{t("numoHelp")}</SheetTitle>{content}
    </MobileSheetContent>
  </Sheet>;
  return <div className="pointer-events-none fixed bottom-0 right-0 top-16 z-20 w-[24rem] overflow-clip">
    <aside id="documentation-numo" aria-label={t("numoHelp")} aria-hidden={!open} inert={!open}
      data-state={open ? "open" : "closed"} className="documentation-numo-panel h-full border-l border-border bg-background">{content}</aside>
  </div>;
}
