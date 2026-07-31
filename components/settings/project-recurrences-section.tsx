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
import { CircleSlash, Repeat, User } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { issueIdentifier } from "@/lib/issue-constants";
import { fetchRecurrencesApi, updateIssueApi } from "@/lib/issues-api";
import { RECURRENCE_CADENCES, type RecurrenceCadence } from "@/lib/recurrence";
import { recurrenceLabel } from "@/lib/recurrence-label";
import { useMembersQuery } from "@/lib/use-members-query";
import type { RecurringIssue } from "@/lib/types";

/**
 * Les récurrences d'un projet, réunies en un seul endroit (MIN-136) : ce que la
 * feature crée est disséminé dans les tickets, et une maintenance qu'on a
 * oubliée ne se retrouve pas en fouillant le tableau.
 *
 * La liste EST celle des tickets qui portent une cadence — un seul ticket vivant
 * par série en porte une. Rien de plus à modéliser : arrêter une récurrence,
 * c'est retirer la cadence du ticket, et changer de cadence, c'est la changer
 * là où elle est écrite. Les deux passent par le PATCH d'issue habituel.
 */
export function ProjectRecurrencesSection({
  projectId,
  projectKey,
}: {
  projectId: string;
  projectKey: string;
}) {
  const t = useTranslations("Recurrence");
  const tField = useTranslations("Field");
  const format = useFormatter();
  const locale = useLocale();
  const { members } = useMembersQuery(projectId, true);

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
    // Optimiste : la ligne ne bouge pas de place, seul son libellé change.
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
      // Le ticket reste, seule la récurrence s'arrête : il sort de cette liste.
      setRows((r) => r?.filter((x) => x.id !== row.id) ?? r);
      toast.success(t("stopped"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Repeat className="size-6" />}
        title={t("empty")}
        description={t("emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {rows.map((row) => {
        const ref = issueIdentifier(projectKey, row.number);
        const due = parseDueDate(row.due_date);
        const assignee = members.find((m) => m.user_id === row.assignee_id);
        return (
          // Deux lignes, toujours : le ticket au-dessus, son horaire en
          // dessous. Sur une seule, la cadence dite en toutes lettres (« tous
          // les 3 du mois à 09:00 ») et le titre se disputaient la largeur —
          // l'un rognait l'autre, et la fin de rangée passait à la ligne.
          <div key={row.id} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="shrink-0 font-mono">
                {ref}
              </Badge>
              <Link
                href={`/projects/${projectId}?issue=${row.id}`}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {row.title}
              </Link>
              {/* Même affordance que les cartes du tableau : un rond pointillé
                  pour « personne », jamais un avatar vide. */}
              {assignee ? (
                <UserAvatar
                  seed={assignee.avatar_seed}
                  title={displayName(assignee)}
                  className="size-6"
                />
              ) : (
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60"
                  title={tField("unassigned")}
                >
                  <User className="size-3.5" />
                </span>
              )}
              {/* En icône, comme les actions de la liste des catégories. */}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busyId === row.id}
                title={t("stop")}
                aria-label={t("stopAria", { ref })}
                onClick={() => void stop(row)}
              >
                <CircleSlash />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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

              {/* La prochaine échéance : c'est elle qui se décalera. Sans son
                  heure — la cadence à côté la dit déjà. */}
              <span className="text-sm tabular-nums text-muted-foreground">
                {due
                  ? `${t("nextOccurrence")} ${format.dateTime(due, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
