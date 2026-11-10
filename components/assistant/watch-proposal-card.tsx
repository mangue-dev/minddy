"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { CalendarClockIcon, CheckIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  NUMO_RECURRING_WATCH_LIMIT,
  NUMO_WATCH_LIMIT,
  parseNumoWatchProposal,
  type NumoWatchProposal,
} from "@/lib/numo-watches";
import {
  NumoWatchApiError,
  confirmNumoWatchProposalApi,
  fetchNumoWatchesApi,
  numoWatchesQueryKey,
} from "@/lib/numo-watches-api";
import { useNumoWatchWording } from "@/lib/use-numo-watch-wording";

/**
 * A recurring reminder that asks for permissions (MIN-953), in Numo's thread.
 *
 * `create_watch` saves nothing when the reminder carries grants: it returns
 * a proposal. This card lists, in plain words, what the reminder would be
 * allowed to do on its own, and the user's click is what saves it, through
 * their own session. Numo cannot confirm in their place.
 *
 * The reminder takes the proposal's id, so the card knows from the user's
 * reminders whether it was confirmed already, across reloads.
 */

/** The proposal carried by a `create_watch` result that waits for the user. */
export function watchProposalOf(result: unknown): NumoWatchProposal | null {
  const r = result as { confirmation_required?: unknown; proposal?: unknown } | undefined;
  return r?.confirmation_required === true ? parseNumoWatchProposal(r.proposal) : null;
}

export function WatchProposalCard({ proposal }: { proposal: NumoWatchProposal }) {
  const t = useTranslations("ToolCall");
  const ta = useTranslations("Account");
  const format = useFormatter();
  const wording = useNumoWatchWording();
  const queryClient = useQueryClient();
  const { data: watches } = useQuery({ queryKey: numoWatchesQueryKey, queryFn: fetchNumoWatchesApi });
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = confirmed || (watches ?? []).some((watch) => watch.id === proposal.id);
  const zone = wording.foreignZone(proposal.timezone);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await confirmNumoWatchProposalApi(proposal);
      setConfirmed(true);
    } catch (failure) {
      const code = failure instanceof NumoWatchApiError ? failure.code : null;
      // Confirmed in another tab, or before this reminder was cancelled.
      if (code === "already_set") setError(t("watchProposalAlreadySet"));
      else if (code === "recurring_limit_reached") {
        setError(ta("numoWatchRecurringLimitReached", { count: NUMO_RECURRING_WATCH_LIMIT }));
      } else if (code === "limit_reached") setError(ta("numoWatchLimitReached", { count: NUMO_WATCH_LIMIT }));
      else setError(t("watchProposalFailed"));
    } finally {
      await queryClient.invalidateQueries({ queryKey: numoWatchesQueryKey });
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <HugeiconsIcon icon={CalendarClockIcon} className="size-4 shrink-0 text-muted-foreground" />
        {set ? t("watchSet") : t("watchProposalTitle")}
      </p>
      <div>
        <p className="font-medium">
          {wording.cadence(proposal.recurrence)}
          {zone && <span className="font-normal text-muted-foreground"> · {zone}</span>}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words">{proposal.instruction}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t("watchProposalIntro")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {proposal.grants.map((grant) => (
            <li key={grant} className="first-letter:uppercase">{wording.grant(grant)}</li>
          ))}
        </ul>
      </div>
      {set ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CheckIcon} className="size-3.5 shrink-0" />
          {t("watchProposalDone")}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {proposal.next_at
              ? t("watchProposalFirstRun", {
                  date: format.dateTime(new Date(proposal.next_at), { dateStyle: "medium", timeStyle: "short" }),
                })
              : null}
          </p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div>
            <Button size="sm" disabled={saving} onClick={() => void confirm()}>
              {t("watchProposalConfirm")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
