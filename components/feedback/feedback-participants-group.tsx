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
 * Effacer un participant du board, sur sa demande (RGPD art. 17).
 *
 * L'éditeur du board est responsable de traitement pour les gens qui y
 * participent : c'est à LUI que la demande arrive, donc c'est ici qu'elle doit
 * pouvoir s'exécuter — pas par un mail à minddy suivi d'un SQL à la main.
 *
 * On cherche par adresse plutôt que de dérouler une liste : la demande arrive
 * toujours sous la forme d'une adresse, et afficher d'office l'annuaire des
 * participants d'un board ferait de cet écran une surface d'exposition de plus
 * pour des données qu'on cherche justement à ne pas étaler.
 *
 * Ce que l'effacement fait exactement — identifiants retirés, contributions
 * gardées sous pseudonyme — est dit dans le dialogue de confirmation ET dans
 * `lib/server/feedback/erasure.ts`. Les deux doivent continuer de dire la même
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

  // La frappe ne doit pas déclencher une requête par lettre — et une recherche
  // à moins de deux caractères ramènerait la moitié du board.
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
      // La personne effacée sort des résultats : la liste doit le montrer sans
      // qu'on ait à retaper la recherche.
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
