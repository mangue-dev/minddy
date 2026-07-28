"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "mangue-ui";
import { Mail } from "lucide-react";
import { useInvitationResponder } from "@/lib/use-invitations-query";

export function PendingInvitationsBanner() {
  const t = useTranslations("Projects");
  const { invitations, busyId, answer } = useInvitationResponder();

  if (invitations.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {invitations.map((inv) => {
        const inviter = inv.inviter_name || inv.inviter_email || t("someone");
        const busy = busyId === inv.id;
        return (
          <div
            key={inv.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Mail className="size-5 shrink-0 text-muted-foreground" />
            {/* Le nom du projet, et rien d'autre : sa clé ne dit rien à qui ne
                connaît pas encore le projet. */}
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{inviter}</span> {t("inviteText")}{" "}
              <span className="font-medium">{inv.project_name}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void answer(inv.id, "reject")}
              >
                {t("reject")}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void answer(inv.id, "accept")}
              >
                {busy && <Spinner />}
                {t("join")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
