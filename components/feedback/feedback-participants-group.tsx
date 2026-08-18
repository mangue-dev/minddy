"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDeleteDialog, Input, Spinner } from "mangue-ui";
import { ShieldOff } from "lucide-react";
import { SettingsGroup, SettingsEmpty } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { TeamFeedbackUserOption } from "@/app/api/projects/[id]/feedback/users/route";

/**
 * Delete a participant from the board, upon their request (GDPR art. 17).
 *
 * The editor of the board is responsible for processing the people who there
 * participate: it is to HIM that the request arrives, therefore it is here that it must
 * be able to execute — not by an email to minddy followed by SQL by hand.
 *
 * We search by address rather than scrolling down a list: the request arrives
 * always in the form of an address, and automatically display the directory of
 * participants of a board would make this screen one more exhibition surface
 * for data that we are precisely trying not to spread.
 *
 * What erasure does exactly — removed identifiers, contributions
 * kept under a pseudonym — is said in the confirmation dialog AND in
 * `lib/server/feedback/erasure.ts`. Both must continue to say the same
 * chose.
 */

interface ErasureReport {
  alreadyErased: boolean;
  posts: number;
  comments: number;
  votes: number;
}

export function FeedbackParticipantsGroup({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<TeamFeedbackUserOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ErasureReport | null>(null);
  const [failed, setFailed] = useState(false);

  // Typing should not trigger a letter query — and a search
  // less than two characters would bring back half the board.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);
  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["feedback-participants", projectId, debounced],
    enabled,
    queryFn: async (): Promise<TeamFeedbackUserOption[]> => {
      const res = await fetch(
        `/api/projects/${projectId}/feedback/users?q=${encodeURIComponent(debounced)}`
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { users?: TeamFeedbackUserOption[] };
      return json.users ?? [];
    },
  });
  const users = data ?? [];

  const erase = async () => {
    if (!target) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/feedback/users?userId=${encodeURIComponent(target.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const json = (await res.json()) as { report: ErasureReport };
      setDone(json.report);
      // The deleted person leaves the results: the list must show this without
      // that we have to retype the search.
      await queryClient.invalidateQueries({
        queryKey: ["feedback-participants", projectId],
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectFeedbackParticipants}
      icon={ShieldOff}
      title={t("feedbackParticipantsTitle")}
      description={t("feedbackParticipantsDesc")}
      help={t("feedbackParticipantsHelp")}
    >
      <div className="flex flex-col gap-3 py-3.5">
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDone(null);
            setFailed(false);
          }}
          placeholder={t("feedbackParticipantsSearchPlaceholder")}
          aria-label={t("feedbackParticipantsSearchPlaceholder")}
        />

        {!enabled ? (
          <p className="text-xs text-muted-foreground">
            {t("feedbackParticipantsHint")}
          </p>
        ) : isFetching ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            {tc("loading")}
          </div>
        ) : users.length === 0 ? (
          <SettingsEmpty className="py-0 text-xs">
            {t("feedbackParticipantsEmpty")}
          </SettingsEmpty>
        ) : (
          <ul className="flex flex-col gap-1">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{user.email ?? user.pseudonym}</p>
                  {user.name && (
                    <p className="truncate text-xs text-muted-foreground">{user.name}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setTarget(user)}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  {t("feedbackParticipantsErase")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {done && (
          <p className="text-xs text-muted-foreground">
            {done.alreadyErased
              ? t("feedbackParticipantsAlready")
              : t("feedbackParticipantsDone", {
                  posts: done.posts,
                  comments: done.comments,
                })}
          </p>
        )}
        {failed && (
          <p className="text-xs text-destructive">
            {t("feedbackParticipantsFailed")}
          </p>
        )}
      </div>

      <ConfirmDeleteDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t("feedbackParticipantsConfirmTitle", {
          name: target?.email ?? target?.pseudonym ?? "",
        })}
        description={t("feedbackParticipantsConfirmDesc")}
        confirmLabel={t("feedbackParticipantsErase")}
        cancelLabel={tc("cancel")}
        onConfirm={erase}
      />
    </SettingsGroup>
  );
}
