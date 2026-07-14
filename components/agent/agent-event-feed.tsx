"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { AlertTriangle, Bot, GitCommit, GitPullRequest } from "lucide-react";
import {
  ChatMessage,
  assistantCopyMessageIds,
} from "@/components/assistant/chat-message";
import { useAgentRunEventsQuery } from "@/lib/use-agent-runs";
import { isAgentRunActive, type AgentRunEvent, type AgentRunStatus } from "@/lib/agent-api";
import type { AssistantMessage, AssistantToolCall } from "@/lib/assistant-types";

/**
 * Flux d'activité d'un run d'agent (MIN-46), rendu en PARITÉ EXACTE avec le chat
 * Numo : on reconstruit les events (`thinking`/`summary`/`tool_call`/`tool_result`)
 * au format `AssistantMessage[]` puis on les rend avec le MÊME `<ChatMessage>`
 * (bulles de message via `MessageResponse`, tool-calls via `ToolCallList`). Les
 * events auxiliaires (PR ouverte, erreur) apparaissent en notes discrètes.
 */

type ToolResult = { status: "running" | "complete"; result?: unknown; success?: boolean };

type FeedItem =
  | { kind: "message"; message: AssistantMessage }
  | { kind: "note"; id: string; variant: "pr" | "commit" | "error"; text: string; url?: string };

function makeMessage(id: string, content: string | null): AssistantMessage {
  return {
    id,
    conversation_id: "",
    role: "assistant",
    content,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    created_at: "",
  };
}

/** Args du tool_call reconstruits en chaîne JSON (ce qu'attend ToolCallList). */
function toolArguments(payload: Record<string, unknown>): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "id" || k === "name") continue;
    rest[k] = v;
  }
  return JSON.stringify(rest);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Regroupe le flux plat d'events en messages assistant (un `thinking`/`summary`
 * ouvre une bulle ; les `tool_call` suivants s'y rattachent, comme un tour Numo)
 * + une Map des résultats de tools (running/complete/succès).
 */
function buildFeed(events: AgentRunEvent[]): { items: FeedItem[]; results: Map<string, ToolResult> } {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const items: FeedItem[] = [];
  const results = new Map<string, ToolResult>();
  let current: AssistantMessage | null = null;

  for (const e of ordered) {
    const p = e.payload ?? {};
    switch (e.type) {
      case "thinking": {
        const text = str(p.text);
        if (!text.trim()) break;
        current = makeMessage(e.id, text);
        items.push({ kind: "message", message: current });
        break;
      }
      case "summary": {
        const text = str(p.text);
        if (!text.trim()) break;
        // Le round terminal émet souvent thinking PUIS summary avec le même texte.
        const last = items[items.length - 1];
        if (last?.kind === "message" && (last.message.content ?? "").trim() === text.trim()) break;
        current = makeMessage(e.id, text);
        items.push({ kind: "message", message: current });
        break;
      }
      case "tool_call": {
        const name = str(p.name);
        const id = str(p.id);
        if (!name || !id) break;
        const tc: AssistantToolCall = {
          id,
          type: "function",
          function: { name, arguments: toolArguments(p) },
        };
        if (!current) {
          current = makeMessage(e.id, null);
          items.push({ kind: "message", message: current });
        }
        current.tool_calls = [...(current.tool_calls ?? []), tc];
        if (!results.has(id)) results.set(id, { status: "running", success: true });
        break;
      }
      case "tool_result": {
        const id = str(p.id);
        if (id) results.set(id, { status: "complete", success: p.success !== false });
        break;
      }
      case "pr_opened": {
        current = null;
        items.push({
          kind: "note",
          id: e.id,
          variant: "pr",
          text: `#${str(p.number) || String(p.number ?? "")}`,
          url: str(p.url) || undefined,
        });
        break;
      }
      case "commit": {
        current = null;
        items.push({ kind: "note", id: e.id, variant: "commit", text: "" });
        break;
      }
      case "error": {
        current = null;
        const msg = str(p.message) || str(p.text);
        if (msg.trim()) items.push({ kind: "note", id: e.id, variant: "error", text: msg });
        break;
      }
      default:
        break;
    }
  }

  return { items, results };
}

function NoteRow({ item }: { item: Extract<FeedItem, { kind: "note" }> }) {
  const t = useTranslations("Agent");
  if (item.variant === "error") {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span className="whitespace-pre-wrap">{item.text}</span>
      </div>
    );
  }
  if (item.variant === "commit") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <GitCommit className="size-4 shrink-0" />
        {t("commitLabel")}
      </div>
    );
  }
  const content = (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-brand">
      <GitPullRequest className="size-4 shrink-0" />
      {t("prOpen")} {item.text}
    </span>
  );
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
      {content}
    </a>
  ) : (
    content
  );
}

export function AgentEventFeed({
  runId,
  status,
  className,
}: {
  runId: string;
  status: AgentRunStatus;
  className?: string;
}) {
  const t = useTranslations("Agent");
  const active = isAgentRunActive(status);
  const { events, loading } = useAgentRunEventsQuery(runId, active);
  const feedRef = useRef<HTMLDivElement>(null);

  const { items, results } = useMemo(() => buildFeed(events), [events]);

  const copyIds = useMemo(
    () =>
      assistantCopyMessageIds(
        items.flatMap((it) => (it.kind === "message" ? [it.message] : [])),
      ),
    [items],
  );

  // Cale le flux en bas dès l'ouverture (même run terminé) puis à chaque nouvel
  // event tant qu'il est actif. useLayoutEffect → pas de flash « scroll depuis
  // le haut » avant peinture.
  useLayoutEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-center", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {active ? <Bot className="size-4 shrink-0 animate-pulse" /> : null}
          <span>{loading || active ? t("working") : t("noActivity")}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={feedRef}
      className={cn("flex flex-col gap-6 overflow-y-auto overscroll-contain", className)}
    >
      {items.map((it) =>
        it.kind === "message" ? (
          <ChatMessage
            key={it.message.id}
            message={it.message}
            toolCallResults={results}
            showCopyButton={copyIds.has(it.message.id)}
          />
        ) : (
          <NoteRow key={it.id} item={it} />
        ),
      )}
      {active ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="size-4 shrink-0 animate-pulse" />
          <span>{t("working")}</span>
        </div>
      ) : null}
    </div>
  );
}
