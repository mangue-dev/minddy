"use client";

import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "mangue-ui";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  CircleSlash,
  GitCommit,
  GitPullRequest,
  ListChecks,
} from "lucide-react";
import { ChatMessage } from "@/components/assistant/chat-message";
import { NumoIcon } from "@/components/numo-icon";
import { useAgentRunEventsQuery } from "@/lib/use-agent-runs";
import { isAgentRunWorking, type AgentRunEvent, type AgentRunStatus } from "@/lib/agent-api";
import type { AssistantMessage, AssistantToolCall } from "@/lib/assistant-types";

/**
 * Flux d'activité d'un run d'agent (MIN-46), rendu en PARITÉ EXACTE avec le chat
 * Numo : on reconstruit les events (`thinking`/`summary`/`tool_call`/`tool_result`)
 * au format `AssistantMessage[]` puis on les rend avec le MÊME `<ChatMessage>`.
 *
 * À la Codex : dès qu'un TOUR se termine (l'agent émet son `summary` final), tout son
 * déroulé (réflexions, tool-calls, updates de plan) se replie dans un accordéon
 * « A travaillé pendant X min Y s » — seul le résumé final reste visible en dessous.
 * Les messages de steering de l'utilisateur séparent les tours et restent visibles ;
 * le tour EN COURS (ou en pause `ask_user`) reste déplié.
 */

type ToolResult = { status: "running" | "complete"; result?: unknown; success?: boolean };

type PlanStep = { step: string; status: string };

type MessageItem = {
  kind: "message";
  message: AssistantMessage;
  /** created_at de l'event qui a ouvert ce message (début de tour). */
  createdAt: string;
  /** Ce message est le résumé final d'un tour (clôt le tour, sort de l'accordéon). */
  isSummary?: boolean;
  /** Pour un summary : created_at de l'event `summary` (fin de tour → durée). */
  endedAt?: string;
};

type FeedItem =
  | MessageItem
  | {
      kind: "note";
      id: string;
      variant: "pr" | "commit" | "error";
      text: string;
      url?: string;
      createdAt: string;
    }
  | { kind: "plan"; id: string; steps: PlanStep[]; createdAt: string };

/** Un TOUR terminé (résumé final) : son travail se replie, le résumé reste visible. */
type Block =
  | { type: "turn"; key: string; work: FeedItem[]; summary: MessageItem; durationMs: number }
  | { type: "loose"; item: FeedItem };

function makeMessage(
  id: string,
  content: string | null,
  role: "assistant" | "user" = "assistant",
): AssistantMessage {
  return {
    id,
    conversation_id: "",
    role,
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
  // Ancien format d'event (runs existants) : arguments COMPLETS sérialisés sous la
  // clé `args`. On la renvoie telle quelle → `args.command` / `args.pattern` sont
  // à nouveau lisibles (rétro-compatible avec les runs déjà enregistrés).
  if (typeof payload.args === "string") return payload.args;
  // Format actuel : résumé d'args à plat (command, pattern, path…).
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
 * + une Map des résultats de tools (running/complete/succès). Chaque item porte le
 * `created_at` de son event ; le message `summary` est marqué `isSummary`.
 */
function buildFeed(events: AgentRunEvent[]): { items: FeedItem[]; results: Map<string, ToolResult> } {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const items: FeedItem[] = [];
  const results = new Map<string, ToolResult>();
  let current: MessageItem | null = null;

  const openMessage = (item: MessageItem) => {
    items.push(item);
    current = item;
  };

  for (const e of ordered) {
    const p = e.payload ?? {};
    switch (e.type) {
      case "thinking": {
        const text = str(p.text);
        if (!text.trim()) break;
        openMessage({ kind: "message", message: makeMessage(e.id, text), createdAt: e.created_at });
        break;
      }
      case "summary": {
        const text = str(p.text);
        if (!text.trim()) break;
        // Le round terminal émet souvent thinking PUIS summary avec le même texte :
        // on ne duplique pas, on MARQUE la dernière bulle comme résumé final.
        const last = items[items.length - 1];
        if (last?.kind === "message" && (last.message.content ?? "").trim() === text.trim()) {
          last.isSummary = true;
          last.endedAt = e.created_at;
          current = null;
          break;
        }
        openMessage({
          kind: "message",
          message: makeMessage(e.id, text),
          createdAt: e.created_at,
          isSummary: true,
          endedAt: e.created_at,
        });
        current = null;
        break;
      }
      case "user_message": {
        const text = str(p.text);
        if (!text.trim()) break;
        // Message de steering de l'utilisateur : bulle user, ne rattache pas les
        // tool-calls suivants (ils appartiennent au prochain tour de l'agent).
        current = null;
        items.push({
          kind: "message",
          message: makeMessage(e.id, text, "user"),
          createdAt: e.created_at,
        });
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
          openMessage({ kind: "message", message: makeMessage(e.id, null), createdAt: e.created_at });
        }
        current!.message.tool_calls = [...(current!.message.tool_calls ?? []), tc];
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
          createdAt: e.created_at,
        });
        break;
      }
      case "commit": {
        current = null;
        items.push({ kind: "note", id: e.id, variant: "commit", text: "", createdAt: e.created_at });
        break;
      }
      case "plan_update": {
        const steps = (Array.isArray(p.plan) ? p.plan : []) as PlanStep[];
        // Une seule checklist affichée : on remplace la précédente par la plus récente.
        const prev = items.findIndex((it) => it.kind === "plan");
        if (prev !== -1) items.splice(prev, 1);
        current = null;
        if (steps.length > 0) items.push({ kind: "plan", id: e.id, steps, createdAt: e.created_at });
        break;
      }
      case "error": {
        current = null;
        const msg = str(p.message) || str(p.text);
        if (msg.trim()) {
          items.push({ kind: "note", id: e.id, variant: "error", text: msg, createdAt: e.created_at });
        }
        break;
      }
      default:
        break;
    }
  }

  return { items, results };
}

/**
 * Découpe le fil en blocs : chaque TOUR clos par un `summary` devient un bloc `turn`
 * (déroulé repliable + résumé final), le reste (messages user, tour en cours ou en
 * pause sans résumé) reste en items `loose` affichés tels quels.
 */
function buildBlocks(items: FeedItem[]): Block[] {
  const blocks: Block[] = [];
  let work: FeedItem[] = [];
  const flush = () => {
    for (const it of work) blocks.push({ type: "loose", item: it });
    work = [];
  };

  for (const it of items) {
    // Un message user sépare les tours : il reste visible, et clôt tout travail en
    // cours non résumé (tour mis en pause) → affiché déplié.
    if (it.kind === "message" && it.message.role === "user") {
      flush();
      blocks.push({ type: "loose", item: it });
      continue;
    }
    // Résumé final : referme le tour. Son travail se replie ; le résumé reste visible.
    if (it.kind === "message" && it.isSummary) {
      if (work.length > 0) {
        const start = work[0].createdAt || it.createdAt;
        const end = it.endedAt || it.createdAt;
        const durationMs = Math.max(0, Date.parse(end) - Date.parse(start));
        blocks.push({ type: "turn", key: it.message.id, work, summary: it, durationMs });
        work = [];
      } else {
        // Aucun travail à replier → on montre le résumé tel quel.
        blocks.push({ type: "loose", item: it });
      }
      continue;
    }
    work.push(it);
  }
  flush();
  return blocks;
}

interface RenderContext {
  results: Map<string, ToolResult>;
  lastCopyableId: string | null;
  lastMessageId: string | null;
}

function renderItem(it: FeedItem, ctx: RenderContext): ReactNode {
  if (it.kind === "message") {
    return (
      <ChatMessage
        key={it.message.id}
        message={it.message}
        toolCallResults={ctx.results}
        showCopyButton={it.message.id === ctx.lastCopyableId}
        isLatestMessage={it.message.id === ctx.lastMessageId}
      />
    );
  }
  if (it.kind === "plan") return <PlanRow key={it.id} item={it} />;
  return <NoteRow key={it.id} item={it} />;
}

/** Libellé « A travaillé pendant X min Y s » (min omises sous 60 s). */
function useWorkedLabel(durationMs: number): string {
  const t = useTranslations("Agent");
  const totalSec = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes > 0
    ? t("workedForMinutes", { minutes, seconds })
    : t("workedForSeconds", { seconds });
}

/** Un tour terminé : accordéon repliable du déroulé + résumé final visible. */
function TurnGroup({
  work,
  summary,
  durationMs,
  ctx,
}: {
  work: FeedItem[];
  summary: MessageItem;
  durationMs: number;
  ctx: RenderContext;
}) {
  const label = useWorkedLabel(durationMs);
  return (
    <div className="flex flex-col gap-3">
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          {label}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 flex flex-col gap-3 border-l border-border pl-3">
            {work.map((it) => renderItem(it, ctx))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {renderItem(summary, ctx)}
    </div>
  );
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

function PlanRow({ item }: { item: Extract<FeedItem, { kind: "plan" }> }) {
  const t = useTranslations("Agent");
  const done = item.steps.filter((s) => s.status === "completed").length;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-muted-foreground">
        <ListChecks className="size-4 shrink-0" />
        <span>{t("plan")}</span>
        <span className="text-xs tabular-nums">
          {done}/{item.steps.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {item.steps.map((s, i) => {
          const Icon =
            s.status === "completed"
              ? CheckCircle2
              : s.status === "in_progress"
                ? CircleDot
                : s.status === "cancelled"
                  ? CircleSlash
                  : Circle;
          return (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2",
                s.status === "completed" && "text-muted-foreground",
                s.status === "cancelled" && "text-muted-foreground line-through",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  (s.status === "in_progress" || s.status === "completed") && "text-brand",
                )}
              />
              <span>{s.step}</span>
            </li>
          );
        })}
      </ul>
    </div>
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
  // On ne poll les events (et n'affiche l'indicateur « travaille ») que tant que
  // l'agent TRAVAILLE ; au repos (needs_input) le fil est figé jusqu'à relance.
  const active = isAgentRunWorking(status);
  const { events, loading } = useAgentRunEventsQuery(runId, active);
  const feedRef = useRef<HTMLDivElement>(null);

  const { items, results } = useMemo(() => buildFeed(events), [events]);
  const blocks = useMemo(() => buildBlocks(items), [items]);

  // Bouton copy UNIQUEMENT sous le DERNIER message de l'agent (avec du texte) —
  // les messages intermédiaires ne sont pas copiables individuellement.
  const lastCopyableId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "message" && it.message.role === "assistant" && it.message.content) {
        return it.message.id;
      }
    }
    return null;
  }, [items]);

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
          {active ? (
            <NumoIcon state="thinking" className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <span className={cn(active && "text-shimmer")}>
            {loading || active ? t("working") : t("noActivity")}
          </span>
        </div>
      </div>
    );
  }

  // Tête vivante : le DERNIER item message, tant que l'agent travaille. Son
  // accordéon de tool-calls fermé shimmer ; dès qu'un message plus récent arrive,
  // il n'est plus le dernier → shimmer retiré.
  let lastMessageId: string | null = null;
  if (active) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "message") {
        lastMessageId = it.message.id;
        break;
      }
    }
  }

  const ctx: RenderContext = { results, lastCopyableId, lastMessageId };

  return (
    <div
      ref={feedRef}
      className={cn("flex flex-col gap-3 overflow-y-auto overscroll-contain", className)}
    >
      {blocks.map((block) =>
        block.type === "turn" ? (
          <TurnGroup
            key={block.key}
            work={block.work}
            summary={block.summary}
            durationMs={block.durationMs}
            ctx={ctx}
          />
        ) : (
          renderItem(block.item, ctx)
        ),
      )}
      {active ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <NumoIcon state="thinking" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-shimmer">{t("working")}</span>
        </div>
      ) : null}
    </div>
  );
}
