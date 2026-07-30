"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  CircleDashed,
  MessagesSquare,
  RotateCcw,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { displayName } from "@/lib/display-name";
import { trackEvent } from "@/lib/analytics";
import { useTrackView } from "@/lib/use-track-view";
import {
  daysLeft,
  useTrashQuery,
  TRASH_TYPE_ORDER,
} from "@/lib/use-trash-query";
import type { TrashItem, TrashType } from "@/lib/trash-api";
import { EmptyState } from "@/components/empty-state";
import { StatsSectionHeader } from "@/components/stats/stats-chrome";
import { UserAvatar } from "@/components/user-avatar";
import { DocPageSkeleton } from "@/components/route-skeletons";

/**
 * La corbeille (MIN-133).
 *
 * Un seul écran pour les quatre choses qu'on peut supprimer — tickets,
 * objectifs, retours, projets — parce que ce qu'on y cherche est toujours la
 * même chose : « je viens d'effacer quelque chose, où est-ce ». Les sections
 * suivent l'ordre du contenu vers le contenant, et chaque ligne dit le délai
 * qui lui reste : c'est l'information qui décide s'il faut agir maintenant.
 *
 * Restaurer est le geste principal (bouton plein) ; supprimer définitivement
 * reste une icône discrète derrière une confirmation — la corbeille existe pour
 * revenir en arrière, pas pour finir le travail.
 */

const TYPE_ICON: Record<TrashType, LucideIcon> = {
  issue: CircleDashed,
  objective: Target,
  feedback: MessagesSquare,
  project: Trash2,
};

const TYPE_HEADING: Record<TrashType, "issues" | "objectives" | "feedback" | "projects"> = {
  issue: "issues",
  objective: "objectives",
  feedback: "feedback",
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
  const locale = useLocale();
  const Icon = TYPE_ICON[item.type];
  const left = daysLeft(item.deleted_at, retentionDays);

  const deletedOn = new Date(item.deleted_at).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
  const actorName = displayName(item.deleted_by, t("someone"));

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {item.identifier ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {item.identifier}
            </span>
          ) : null}
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.deleted_by ? (
            <UserAvatar seed={item.deleted_by.avatar_seed} className="size-3.5" />
          ) : null}
          <span className="truncate">
            {item.project_name
              ? t("deletedByInProject", {
                  name: actorName,
                  project: item.project_name,
                  date: deletedOn,
                })
              : t("deletedBy", { name: actorName, date: deletedOn })}
          </span>
        </div>
      </div>

      {/* Le compte à rebours : au-delà, le balayage nocturne tranche. */}
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          left <= 3 ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {left <= 0 ? t("daysLeftNone") : t("daysLeft", { count: left })}
      </span>

      <Button size="sm" variant="outline" onClick={() => onRestore(item)}>
        <RotateCcw className="size-3.5" />
        {t("restore")}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("purge")}
            onClick={() => onPurge(item)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("purge")}</TooltipContent>
      </Tooltip>
    </li>
  );
}

export default function TrashPage() {
  const t = useTranslations("Trash");
  const { items, retentionDays, loading, restore, purge, empty } = useTrashQuery();
  const [pending, setPending] = useState<TrashItem | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  useTrackView(true, "viewed", () =>
    trackEvent("trash_viewed", { items: items.length })
  );

  const grouped = useMemo(() => {
    const byType = new Map<TrashType, TrashItem[]>();
    for (const item of items) {
      const bucket = byType.get(item.type) ?? [];
      bucket.push(item);
      byType.set(item.type, bucket);
    }
    return TRASH_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
      type,
      items: byType.get(type)!,
    }));
  }, [items]);

  const header = (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { days: retentionDays })}
          </p>
        </div>
        {items.length > 0 ? (
          <Button variant="ghost" onClick={() => setEmptyOpen(true)}>
            {t("emptyTrash")}
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {header}
        <DocPageSkeleton rows={3} rowClassName="h-16" />
      </div>
    );
  }

  const handleRestore = async (item: TrashItem) => {
    try {
      await restore(item);
      toast.success(t("restored", { title: item.title }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      {header}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="size-6" />}
          title={t("emptyTitle")}
          description={t("empty", { days: retentionDays })}
        />
      ) : (
        grouped.map(({ type, items: rows }) => (
          <section key={type} className="mt-8 first:mt-0">
            <StatsSectionHeader title={t(TYPE_HEADING[type])} />
            <ul className="-mx-3 flex flex-col">
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

      <ConfirmDeleteDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("purgeTitle", { title: pending?.title ?? "" })}
        description={t("purgeConfirm")}
        confirmLabel={t("purge")}
        onConfirm={async () => {
          if (!pending) return;
          try {
            await purge(pending);
            toast.success(t("purged"));
          } catch (e) {
            toast.error((e as Error).message);
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
        onConfirm={async () => {
          try {
            await empty();
            toast.success(t("emptied"));
          } catch (e) {
            toast.error((e as Error).message);
          }
          setEmptyOpen(false);
        }}
      />
    </div>
  );
}
