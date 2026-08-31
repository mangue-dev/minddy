"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  cn,
  toast,
} from "mangue-ui";
import {
  CalendarClock,
  ChevronLeft,
  CircleDashed,
  FileText,
  MessagesSquare,
  MoreHorizontal,
  RotateCcw,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { AppContentHeader } from "@/components/app-content-header";
import { MentionChip } from "@/components/mention-chip";
import { ProjectOrb } from "@/components/project-orb";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { UserAvatar } from "@/components/user-avatar";
import { trackEvent } from "@/lib/analytics";
import { displayName } from "@/lib/display-name";
import type { TrashItem, TrashType } from "@/lib/trash-api";
import {
  daysLeft,
  TRASH_TYPE_ORDER,
  useTrashQuery,
} from "@/lib/use-trash-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useTrackView } from "@/lib/use-track-view";

type TrashFilter = "all" | TrashType;

const TYPE_ICON: Record<TrashType, LucideIcon> = {
  issue: CircleDashed,
  objective: Target,
  page: FileText,
  feedback: MessagesSquare,
  routine: CalendarClock,
  project: Trash2,
};

const TYPE_ICON_STYLE: Record<TrashType, string> = {
  issue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  objective: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  page: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  feedback: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  routine: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  project: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

const TYPE_HEADING: Record<
  TrashType,
  "issues" | "objectives" | "pages" | "feedback" | "routines" | "projects"
> = {
  issue: "issues",
  objective: "objectives",
  page: "pages",
  feedback: "feedback",
  routine: "routines",
  project: "projects",
};

function TrashRow({
  item,
  retentionDays,
  onRestore,
  onPurge,
}: {
  item: TrashItem;
  retentionDays: number;
  onRestore: (item: TrashItem) => void;
  onPurge: (item: TrashItem) => void;
}) {
  const t = useTranslations("Trash");
  const tPages = useTranslations("Pages");
  const locale = useLocale();
  const Icon = TYPE_ICON[item.type];
  const left = daysLeft(item.deleted_at, retentionDays);
  const title = item.title.trim() || tPages("untitled");

  const deletedOn = new Date(item.deleted_at).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
  const actorName = displayName(item.deleted_by, t("someone"));

  return (
    <li className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start gap-3">
        {item.type === "project" ? (
          <ProjectOrb
            seed={item.project_orb_seed || item.id}
            iconUrl={item.project_icon_url}
            className="size-10 rounded-lg"
          />
        ) : (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              TYPE_ICON_STYLE[item.type],
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {item.identifier ? (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {item.identifier}
              </span>
            ) : null}
            <h3 className="min-w-0 flex-1 basis-48 truncate text-base font-medium tracking-tight">
              {title}
            </h3>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {item.project_id && item.project_name ? (
              <MentionChip
                type="project"
                id={item.project_id}
                label={item.project_name}
                avatarSeed={item.project_orb_seed}
                iconUrl={item.project_icon_url}
                className="mx-0 max-w-48 overflow-hidden text-[1.05em] text-ellipsis"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {item.deleted_by ? (
              <UserAvatar
                seed={item.deleted_by.avatar_seed}
                className="size-4"
              />
            ) : null}
            <span className="truncate">
              {t("deletedBy", { name: actorName, date: deletedOn })}
            </span>
          </span>
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              left <= 3 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {left <= 0 ? t("daysLeftNone") : t("daysLeft", { count: left })}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("moreActions")}
              data-sidebar-filter-result
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onRestore(item)}>
              <RotateCcw />
              {t("restore")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onPurge(item)}
            >
              <Trash2 />
              {t("purge")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export default function TrashPage() {
  const t = useTranslations("Trash");
  const tCommon = useTranslations("Common");
  const tPages = useTranslations("Pages");
  const contentFade = useScrollFade<HTMLDivElement>();
  const { items, retentionDays, loading, restore, purge, empty } =
    useTrashQuery();
  const [filter, setFilter] = useState<TrashFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [pending, setPending] = useState<TrashItem | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  useTrackView(true, "viewed", () =>
    trackEvent("trash_viewed", { items: items.length }),
  );

  const typeCounts = useMemo<Record<TrashType, number>>(() => {
    const counts: Record<TrashType, number> = {
      issue: 0,
      objective: 0,
      page: 0,
      feedback: 0,
      routine: 0,
      project: 0,
    };
    for (const item of items) counts[item.type] += 1;
    return counts;
  }, [items]);

  const groups = useMemo(() => {
    const byType = new Map<TrashType, TrashItem[]>();
    for (const item of items) {
      if (filter !== "all" && item.type !== filter) continue;
      if (
        !matchesFilter(query, [
          item.title.trim() || tPages("untitled"),
          item.identifier,
          item.project_name,
          displayName(item.deleted_by, t("someone")),
          t(TYPE_HEADING[item.type]),
        ])
      ) {
        continue;
      }
      const bucket = byType.get(item.type) ?? [];
      bucket.push(item);
      byType.set(item.type, bucket);
    }
    return TRASH_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
      type,
      items: byType.get(type)!,
    }));
  }, [filter, items, query, t, tPages]);

  const filterItems = [
    {
      value: "all",
      label: t("all"),
      count: items.length > 0 ? items.length : undefined,
    },
    ...TRASH_TYPE_ORDER.map((type) => ({
      value: type,
      label: t(TYPE_HEADING[type]),
      count: typeCounts[type] > 0 ? typeCounts[type] : undefined,
    })),
  ].map((item) => ({
    ...item,
    countLabel:
      item.count !== undefined
        ? t("categoryCount", { count: item.count })
        : undefined,
  }));

  const handleRestore = async (item: TrashItem) => {
    try {
      await restore(item);
      toast.success(t("restored", { title: item.title }));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const emptyTitle = query.trim()
    ? tCommon("noFilterMatch")
    : items.length === 0
      ? t("emptyTitle")
      : t("emptyCategoryTitle");
  const EmptyIcon = filter === "all" ? Trash2 : TYPE_ICON[filter];

  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: items.length }),
          clearLabel: tCommon("clearFilter"),
        }}
      >
        <SidebarNavRail
          label={t("title")}
          items={filterItems}
          value={filter}
          onValueChange={(value) => {
            setFilter(value as TrashFilter);
            setMobileDetail(true);
          }}
        />
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        <AppContentHeader contentClassName="justify-end gap-4 px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("title")}
            className="mr-auto md:hidden"
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          {items.length > 0 ? (
            <Button variant="ghost" onClick={() => setEmptyOpen(true)}>
              {t("emptyTrash")}
            </Button>
          ) : null}
        </AppContentHeader>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <EmptyScene
                icon={EmptyIcon}
                tone={filter === "all" ? "destructive" : undefined}
                title={emptyTitle}
              />
            ) : (
              groups.map(({ type, items: rows }, index) => (
                <section key={type} className={cn(index > 0 && "mt-8")}>
                  <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">
                    {t(TYPE_HEADING[type])}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {rows.map((item) => (
                      <TrashRow
                        key={`${item.type}:${item.id}`}
                        item={item}
                        retentionDays={retentionDays}
                        onRestore={handleRestore}
                        onPurge={setPending}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("purgeTitle", { title: pending?.title ?? "" })}
        description={t("purgeConfirm")}
        confirmLabel={t("purge")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          if (!pending) return;
          try {
            await purge(pending);
            toast.success(t("purged"));
          } catch (error) {
            toast.error((error as Error).message);
          }
          setPending(null);
        }}
      />

      <ConfirmDeleteDialog
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        title={t("emptyTrashTitle")}
        description={t("emptyTrashConfirm", { count: items.length })}
        confirmLabel={t("emptyTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          try {
            await empty();
            toast.success(t("emptied"));
          } catch (error) {
            toast.error((error as Error).message);
          }
          setEmptyOpen(false);
        }}
      />
    </div>
  );
}
