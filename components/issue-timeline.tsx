"use client";

import { useEffect, useRef, useState } from "react";
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
import { describeEvent, type EventContext } from "@/lib/describe-event";
import type { TimelineItem } from "@/lib/use-issue-timeline";
import { MentionTextarea, extractMentions } from "@/components/mention-textarea";
import { Markdown } from "@/components/markdown";
import { avatarColor, initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
import type { Member } from "@/lib/types";

type EventItem = Extract<TimelineItem, { kind: "event" }>;
type CommentItem = Extract<TimelineItem, { kind: "comment" }>;

/** Compact French relative time, e.g. "Il y a 7min". */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return "À l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `Il y a ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `Il y a ${d}j`;
  const w = Math.round(d / 7);
  if (w < 5) return `Il y a ${w} sem`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `Il y a ${mo} mois`;
  return `Il y a ${Math.round(d / 365)} an${d >= 730 ? "s" : ""}`;
}

function actorName(members: Member[], id: string | null): string {
  if (!id) return "Quelqu'un";
  const m = members.find((x) => x.user_id === id);
  return displayName(m, "Un utilisateur");
}

function Avatar({ seed, name }: { seed: string | null; name: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
      style={{ backgroundColor: avatarColor(seed ?? name) }}
      aria-hidden
    >
      {initials(name)}
    </span>
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
  const name = actorName(ctx.members, item.event.actor_id);
  const summary = describeEvent(item.event, ctx);
  return (
    <li className="flex items-center gap-2.5">
      <Avatar seed={item.event.actor_id} name={name} />
      <OneLine full={`${name} ${summary}`}>
        <span className="font-medium text-foreground">{name}</span>{" "}
        <span className="text-muted-foreground">{summary}</span>
      </OneLine>
      <span className="shrink-0 text-xs text-muted-foreground/80">
        {timeAgo(item.event.created_at)}
      </span>
    </li>
  );
}

function CommentRow({ item, ctx }: { item: CommentItem; ctx: EventContext }) {
  const name = actorName(ctx.members, item.comment.author_id);
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5">
        <Avatar seed={item.comment.author_id} name={name} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <OneLine full={`${name} a laissé un commentaire`}>
            <span className="font-medium text-foreground">{name}</span>{" "}
            <span className="text-muted-foreground">a laissé un commentaire</span>
          </OneLine>
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {timeAgo(item.comment.created_at)}
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
          {items.length} événements
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
        <span>Activité</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open &&
        (rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Aucune activité pour l&apos;instant.
          </p>
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
        placeholder="Ajouter un commentaire, @ pour mentionner"
        dropUp
        className="rounded-none border-0 bg-transparent px-3.5 py-3 focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="flex justify-end px-2.5 pb-2.5">
        <Button
          size="sm"
          className="rounded-full px-4"
          disabled={posting || !draft.trim()}
          onClick={() => void submit()}
        >
          {posting && <Spinner />}
          Commenter
        </Button>
      </div>
    </div>
  );
}
