"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from "mangue-ui";
import { CircleSlash, Plus, Repeat, User } from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { SettingsGroup, SettingsListRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { parseDueDate } from "@/lib/due-date";
import { issueIdentifier } from "@/lib/issue-constants";
import { fetchRecurrencesApi, updateIssueApi } from "@/lib/issues-api";
import { RECURRENCE_CADENCES, type RecurrenceCadence } from "@/lib/recurrence";
import { recurrenceLabel } from "@/lib/recurrence-label";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCreate } from "@/lib/create-context";
import type { RecurringIssue } from "@/lib/types";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * The recurrences of a project, gathered in one place (MIN-136): what the
 * feature creates is scattered in the tickets, and maintenance that we have
 * forgotten cannot be found by searching the table.
 *
 * The list IS that tickets that carry a cadence — only one living ticket
 * per series carries one. Nothing more to model: stopping a recurrence,
 * is removing the cadence from the ticket, and changing the cadence is changing it
 * where it is written. Both go through the usual issue PATCH.
 */
export function ProjectRecurrencesSection({
  projectId,
  projectKey,
  title,
  description,
}: {
  projectId: string;
  projectKey: string;
  /** Group title and index — the page reads them in the Recurrence namespace. */
  title: string;
  description: string;
}) {
  const t = useTranslations("Recurrence");
  const tBoard = useTranslations("Board");
  const tField = useTranslations("Field");
  const format = useFormatter();
  const locale = useLocale();
  const { members } = useMembersQuery(projectId, true);
  const { openCreateIssue } = useCreate();

  const [rows, setRows] = useState<RecurringIssue[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchRecurrencesApi(projectId));
    } catch {
      setRows([]);
      toast.error(t("loadFailed"));
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCadence = async (row: RecurringIssue, recurrence: RecurrenceCadence) => {
    setBusyId(row.id);
    // Optimistic: the line does not move, only its wording changes.
    setRows((r) => r?.map((x) => (x.id === row.id ? { ...x, recurrence } : x)) ?? r);
    try {
      await updateIssueApi(row.id, { recurrence });
    } catch (e) {
      toast.error((e as Error).message);
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (row: RecurringIssue) => {
    setBusyId(row.id);
    try {
      await updateIssueApi(row.id, { recurrence: null });
      // The ticket remains, only the recurrence stops: it leaves this list.
      setRows((r) => r?.filter((x) => x.id !== row.id) ?? r);
      toast.success(t("stopped"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectRecurrences}
      icon={Repeat}
      title={title}
      description={description}
      variant={rows !== null && rows.length === 0 ? "block" : "rows"}
    >
      {rows === null ? (
        <div className="flex flex-col gap-2 py-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : rows.length === 0 ? (
        /* A recurrence is not created here: it is born from a ticket to which on
 gives a cadence. The gesture offered is therefore “new ticket”. */
        <EmptyScene size="compact" icon={Repeat} title={t("empty")}>
          <Button type="button" size="sm" onClick={() => openCreateIssue()}>
            <Plus />
            {tBoard("newIssue")}
          </Button>
        </EmptyScene>
      ) : (
        rows.map((row) => {
          const ref = issueIdentifier(projectKey, row.number);
          const due = parseDueDate(row.due_date);
          const assignee = members.find((m) => m.user_id === row.assignee_id);
          return (
            <SettingsListRow
              key={row.id}
              avatar={
                <Badge variant="secondary" className="shrink-0 font-mono">
                  {ref}
                </Badge>
              }
              title={
                <Link
                  href={`/projects/${projectId}?issue=${row.id}`}
                  className="hover:underline"
                >
                  {row.title}
                </Link>
              }
              /* The next deadline: it is this which will be postponed. Without its
 hour — the cadence next to it already says it. */
              subtitle={
                due
                  ? `${t("nextOccurrence")} ${format.dateTime(due, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : "—"
              }
              action={
                <>
                  {/* Same affordance as the cards in the table: a dotted circle
 for “person”, never an empty avatar. */}
                  {assignee ? (
                    <UserAvatar
                      seed={assignee.avatar_seed}
                      title={displayName(assignee)}
                      className="size-6"
                    />
                  ) : (
                    <AppTooltip label={tField("unassigned")}>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60">
                        <User className="size-3.5" />
                      </span>
                    </AppTooltip>
                  )}

                  <Select
                    value={row.recurrence}
                    onValueChange={(v) => void setCadence(row, v as RecurrenceCadence)}
                    disabled={busyId === row.id}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-auto"
                      aria-label={t("cadenceAria", { ref })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_CADENCES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {recurrenceLabel(c, due, t, format, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* As an icon, like the actions in the category list. */}
                  <AppTooltip label={t("stop")}>
                    <span className="inline-flex">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busyId === row.id}
                        aria-label={t("stopAria", { ref })}
                        onClick={() => void stop(row)}
                      >
                        <CircleSlash />
                      </Button>
                    </span>
                  </AppTooltip>
                </>
              }
            />
          );
        })
      )}
    </SettingsGroup>
  );
}
