"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  describeEvent,
  type EventContext,
  type EventTranslators,
} from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { Member } from "@/lib/types";

type EventItem = Extract<TimelineItem, { kind: "event" }>;
type CommentItem = Extract<TimelineItem, { kind: "comment" }>;
type TimelineT = ReturnType<typeof useTranslations>;

/** Compact localized relative time, e.g. "Il y a 7min" / "7min ago". */
function timeAgo(iso: string, t: TimelineT): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return t("now");
  const m = Math.round(s / 60);
  if (m < 60) return t("minutesAgo", { m });
  const h = Math.round(m / 60);
  if (h < 24) return t("hoursAgo", { h });
  const d = Math.round(h / 24);
  if (d < 7) return t("daysAgo", { d });
  const w = Math.round(d / 7);
  if (w < 5) return t("weeksAgo", { w });
  const mo = Math.round(d / 30);
  if (mo < 12) return t("monthsAgo", { mo });
  return t("yearsAgo", { y: Math.round(d / 365) });
}

function actorName(members: Member[], id: string | null, t: TimelineT): string {
  if (!id) return t("someone");
  const m = members.find((x) => x.user_id === id);
  return displayName(m, t("someUser"));
}

/** Bridge next-intl translators into the loose types describeEvent expects. */
function useEventTranslators(): EventTranslators {
  const tActivity = useTranslations("Activity");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  return {
    t: (key, values) =>
      tActivity(key as Parameters<typeof tActivity>[0], values as never),
    tStatus: (v) => tStatus(v as Parameters<typeof tStatus>[0]),
    tPriority: (v) => tPriority(v as Parameters<typeof tPriority>[0]),
  };
}

/** Actor avatar (real photo when available, else colored initials), resolved
    from the members list by id. */
function ActorAvatar({
  members,
  id,
  name,
  className,
}: {
  members: Member[];
  id: string | null;
  name: string;
  className?: string;
}) {
  const url = id ? members.find((m) => m.user_id === id)?.avatar_url ?? null : null;
  return (
    <UserAvatar
      url={url}
      name={name}
      seed={id ?? name}
      className={cn("size-5 text-[9px]", className)}
    />
  );
}

/** One-line text that ellipsises and reveals the full text in a tooltip only
    when it actually overflows. */
function OneLine({ full, children }: { full: string; children: React.ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (el) setTruncated(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const p = (
    <p ref={ref} className="min-w-0 flex-1 truncate text-sm">
      {children}
    </p>
  );
  if (!truncated) return p;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{p}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{full}</TooltipContent>
    </Tooltip>
  );
}

function EventRow({ item, ctx }: { item: EventItem; ctx: EventContext }) {
  const t = useTranslations("Timeline");
  const tr = useEventTranslators();
  const name = actorName(ctx.members, item.event.actor_id, t);
  const summary = describeEvent(item.event, ctx, tr);
  return (
    <li className="flex items-center gap-2.5">
      <ActorAvatar members={ctx.members} id={item.event.actor_id} name={name} />
      <OneLine full={`${name} ${summary}`}>
        <span className="font-medium text-foreground">{name}</span>{" "}
        <span className="text-muted-foreground">{summary}</span>
      </OneLine>
      <span className="shrink-0 text-xs text-muted-foreground/80">
        {timeAgo(item.event.created_at, t)}
      </span>
    </li>
  );
}

function CommentRow({ item, ctx }: { item: CommentItem; ctx: EventContext }) {
  const t = useTranslations("Timeline");
  const name = actorName(ctx.members, item.comment.author_id, t);
  return (
    <li className="flex items-start gap-2.5">
      <ActorAvatar
        members={ctx.members}
        id={item.comment.author_id}
        name={name}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <OneLine full={`${name} ${t("leftComment")}`}>
            <span className="font-medium text-foreground">{name}</span>{" "}
            <span className="text-muted-foreground">{t("leftComment")}</span>
          </OneLine>
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {timeAgo(item.comment.created_at, t)}
          </span>
        </div>
        <Markdown className="text-foreground" members={ctx.members}>
          {item.comment.body}
        </Markdown>
      </div>
    </li>
  );
}

/** A run of events between two comments — collapsed behind "N événements" so
    the surrounding comments stand out. */
function EventsGroup({ items, ctx }: { items: EventItem[]; ctx: EventContext }) {
  const t = useTranslations("Timeline");
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-left outline-none"
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </span>
        <span className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          {t("eventsCount", { count: items.length })}
        </span>
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-3">
          {items.map((it) => (
            <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} />
          ))}
        </ol>
      )}
    </li>
  );
}

/** Groups consecutive events (delimited by comments) so comments stay isolated;
    a run of 3+ events collapses into a "N événements" accordion. */
function groupRows(
  items: TimelineItem[]
): ({ type: "comment"; item: CommentItem } | { type: "events"; items: EventItem[] })[] {
  const rows: ({ type: "comment"; item: CommentItem } | { type: "events"; items: EventItem[] })[] = [];
  let buffer: EventItem[] = [];
  const flush = () => {
    if (buffer.length) {
      rows.push({ type: "events", items: buffer });
      buffer = [];
    }
  };
  for (const it of items) {
    if (it.kind === "comment") {
      flush();
      rows.push({ type: "comment", item: it });
    } else {
      buffer.push(it);
    }
  }
  flush();
  return rows;
}

/** Minimalist activity feed inside a collapsible section. */
export function IssueActivity({
  items,
  ctx,
}: {
  items: TimelineItem[];
  ctx: EventContext;
}) {
  const t = useTranslations("Timeline");
  const [open, setOpen] = useState(true);
  const rows = groupRows(items);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between py-1 text-sm font-medium outline-none"
      >
        <span>{t("activity")}</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open &&
        (rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-3">
            {rows.map((row, i) => {
              if (row.type === "comment") {
                return <CommentRow key={`c-${row.item.comment.id}`} item={row.item} ctx={ctx} />;
              }
              if (row.items.length > 2) {
                return <EventsGroup key={`g-${i}`} items={row.items} ctx={ctx} />;
              }
              return row.items.map((it) => (
                <EventRow key={`e-${it.event.id}`} item={it} ctx={ctx} />
              ));
            })}
          </ol>
        ))}
    </div>
  );
}

/** Fixed comment composer (panel footer). */
export function CommentComposer({
  members,
  onSubmit,
}: {
  members: Member[];
  onSubmit: (body: string, mentionedUserIds: string[]) => Promise<void>;
}) {
  const t = useTranslations("Timeline");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await onSubmit(body, extractMentions(draft, members));
      setDraft("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card transition-colors focus-within:border-ring">
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        members={members}
        onSubmit={() => void submit()}
        placeholder={t("commentPlaceholder")}
        dropUp
        className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="flex justify-end px-2.5 pb-2.5">
        <Button
          size="sm"
          className="rounded-full px-4"
          disabled={posting || !draft.trim()}
          onClick={() => void submit()}
        >
          {posting && <Spinner />}
          {t("comment")}
        </Button>
      </div>
    </div>
  );
}
