"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useProjects } from "@/lib/projects-context";
import { isNumoWatchIssueStatus, isNumoWatchObjectiveStatus } from "@/lib/numo-watches";
import {
  cancelNumoWatchApi,
  fetchNumoWatchesApi,
  numoWatchesQueryKey,
  type NumoWatchListItem,
} from "@/lib/numo-watches-api";

/**
 * Account → AI & Numo → Reminders (MIN-923): what Numo is waiting on for the
 * user, each one cancellable. Reminders are set and changed in a
 * conversation with Numo; this list only shows and cancels them.
 */
export function AccountNumoWatchesSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const tObjective = useTranslations("ObjectiveStatus");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  // Numo sets and fires reminders outside this screen: read them on every visit.
  const { data: watches = [], isPending } = useQuery({
    queryKey: numoWatchesQueryKey,
    queryFn: fetchNumoWatchesApi,
    refetchOnMount: "always",
  });
  const [toCancel, setToCancel] = useState<NumoWatchListItem | null>(null);

  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" });

  const condition = (watch: NumoWatchListItem) => {
    if (watch.target_type === "date" && watch.fire_at) return t("numoWatchWhenDate", { date: date(watch.fire_at) });
    const subject = watch.subject ?? t("numoWatchSubjectFallback");
    if (watch.condition.kind === "comment") return t("numoWatchWhenComment", { subject });
    const status = watch.condition.kind === "status" ? watch.condition.status : "";
    const label = watch.target_type === "issue" && isNumoWatchIssueStatus(status)
      ? tStatus(status)
      : watch.target_type === "objective" && isNumoWatchObjectiveStatus(status)
        ? tObjective(status)
        : status;
    return t("numoWatchWhenStatus", { subject, status: label });
  };

  const cancel = async () => {
    if (!toCancel) return;
    try {
      await cancelNumoWatchApi(toCancel.id);
      await queryClient.invalidateQueries({ queryKey: numoWatchesQueryKey });
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountNumoWatches}
        title={t("numoWatchesTitle")}
        help={t("numoWatchesHelp")}
      >
        {isPending ? (
          <RowsSkeleton rows={2} />
        ) : watches.length === 0 ? (
          <SettingsEmpty>{t("numoWatchesEmpty")}</SettingsEmpty>
        ) : (
          watches.map((watch) => (
            <div key={watch.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{condition(watch)}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{watch.instruction}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    watch.action === "act" ? t("numoWatchActionAct") : t("numoWatchActionNotify"),
                    watch.accessible
                      ? projects.find((project) => project.id === watch.project_id)?.name
                      : t("numoMemoryOtherProject"),
                    // A date reminder fires on its date: its expiry adds nothing.
                    watch.target_type === "date" ? null : t("numoWatchExpires", { date: day(watch.expires_at) }),
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              <AppTooltip label={t("numoWatchCancel")}>
                <IconButton
                  size="sm"
                  aria-label={t("numoWatchCancel")}
                  onClick={() => setToCancel(watch)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </IconButton>
              </AppTooltip>
            </div>
          ))
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toCancel}
        onOpenChange={(open) => !open && setToCancel(null)}
        title={t("numoWatchCancelTitle")}
        description={t("numoWatchCancelDescription")}
        confirmLabel={t("numoWatchCancel")}
        cancelLabel={tc("back")}
        closeOnConfirm={false}
        onConfirm={async () => {
          await cancel().then(() => setToCancel(null), () => undefined);
        }}
      />
    </>
  );
}
