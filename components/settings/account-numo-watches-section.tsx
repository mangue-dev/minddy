"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useOptionalAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useProjects } from "@/lib/projects-context";
import {
  NUMO_RECURRING_WATCH_LIMIT,
  NUMO_WATCH_LIMIT,
  isNumoWatchIssueStatus,
  isNumoWatchObjectiveStatus,
} from "@/lib/numo-watches";
import {
  NumoWatchApiError,
  cancelNumoWatchApi,
  fetchNumoWatchesApi,
  numoWatchesQueryKey,
  setNumoWatchPausedApi,
  type NumoWatchListItem,
} from "@/lib/numo-watches-api";
import { useNumoWatchWording } from "@/lib/use-numo-watch-wording";

/**
 * Account → AI & Numo → Reminders (MIN-923): what Numo is waiting on for the
 * user, each one cancellable. Reminders are set and changed in a
 * conversation with Numo; this list shows and cancels them.
 *
 * A recurring reminder (MIN-953) also shows its cadence, its next
 * occurrence, what the user allowed it to do and how its last occurrence
 * went, and can be paused and resumed here.
 */
export function AccountNumoWatchesSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const tStatus = useTranslations("Status");
  const tObjective = useTranslations("ObjectiveStatus");
  const format = useFormatter();
  const wording = useNumoWatchWording();
  const queryClient = useQueryClient();
  const panel = useOptionalAssistantPanelActions();
  const { projects } = useProjects();
  // Numo sets and fires reminders outside this screen: read them on every visit.
  const { data: watches = [], isPending } = useQuery({
    queryKey: numoWatchesQueryKey,
    queryFn: fetchNumoWatchesApi,
    refetchOnMount: "always",
  });
  const [toCancel, setToCancel] = useState<NumoWatchListItem | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" });

  const condition = (watch: NumoWatchListItem) => {
    if (watch.recurrence) return wording.cadence(watch.recurrence);
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

  /** How the last occurrence of a recurring reminder went. */
  const lastRun = (watch: NumoWatchListItem) => {
    if (!watch.recurrence || !watch.fired_at) return null;
    const when = { date: date(watch.fired_at) };
    if (watch.outcome === "failed") return t("numoWatchLastRunFailed", when);
    if (watch.outcome === "budget_fallback") return t("numoWatchLastRunBudget", when);
    return t("numoWatchLastRun", when);
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

  const setPaused = async (watch: NumoWatchListItem, paused: boolean) => {
    setChanging(watch.id);
    try {
      await setNumoWatchPausedApi(watch.id, paused);
    } catch (error) {
      const code = error instanceof NumoWatchApiError ? error.code : null;
      toast.error(code === "recurring_limit_reached"
        ? t("numoWatchRecurringLimitReached", { count: NUMO_RECURRING_WATCH_LIMIT })
        : code === "limit_reached"
          ? t("numoWatchLimitReached", { count: NUMO_WATCH_LIMIT })
          : t("numoWatchChangeFailed"));
    } finally {
      await queryClient.invalidateQueries({ queryKey: numoWatchesQueryKey });
      setChanging(null);
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
          watches.map((watch) => {
            const paused = watch.status === "paused";
            const run = lastRun(watch);
            const zone = watch.recurrence ? wording.foreignZone(watch.timezone) : null;
            return (
              <div key={watch.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {condition(watch)}
                    {paused && <Badge variant="secondary" className="h-5 px-1.5">{t("numoWatchPaused")}</Badge>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{watch.instruction}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      watch.action === "act" ? t("numoWatchActionAct") : t("numoWatchActionNotify"),
                      watch.accessible
                        ? projects.find((project) => project.id === watch.project_id)?.name
                        : t("numoMemoryOtherProject"),
                      watch.recurrence
                        ? !paused && watch.fire_at ? t("numoWatchNext", { date: date(watch.fire_at) }) : null
                        // A date reminder fires on its date: its expiry adds nothing.
                        : watch.target_type === "date" ? null : t("numoWatchExpires", { date: day(watch.expires_at) }),
                      zone,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {watch.grants.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("numoWatchAllowed", { grants: watch.grants.map(wording.grant).join(" · ") })}
                    </p>
                  )}
                  {run && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {run}
                      {watch.conversation_id && panel && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:text-foreground"
                            onClick={() => panel.open({ conversationId: watch.conversation_id as string })}
                          >
                            {t("numoWatchOpenRun")}
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {watch.recurrence && (
                    <AppTooltip label={paused ? t("numoWatchResume") : t("numoWatchPause")}>
                      <IconButton
                        size="sm"
                        aria-label={paused ? t("numoWatchResume") : t("numoWatchPause")}
                        disabled={changing === watch.id}
                        onClick={() => void setPaused(watch, !paused)}
                      >
                        <HugeiconsIcon icon={paused ? PlayIcon : PauseIcon} className="size-4" />
                      </IconButton>
                    </AppTooltip>
                  )}
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
              </div>
            );
          })
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
