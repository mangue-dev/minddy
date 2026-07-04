"use client";

import { useState } from "react";
import { Button, Spinner, toast } from "mangue-ui";
import { Mail } from "lucide-react";
import { useMyInvitations } from "@/lib/use-invitations-query";

export function PendingInvitationsBanner() {
  const { invitations, respond } = useMyInvitations();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  const handle = async (invitationId: string, action: "accept" | "reject") => {
    setBusyId(invitationId);
    try {
      await respond(invitationId, action);
      toast.success(
        action === "accept" ? "Invitation acceptée." : "Invitation refusée."
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-2">
      {invitations.map((inv) => {
        const inviter = inv.inviter_name || inv.inviter_email || "Quelqu'un";
        const busy = busyId === inv.id;
        return (
          <div
            key={inv.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Mail className="size-5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{inviter}</span> t&apos;invite à rejoindre
              le Projet <span className="font-medium">{inv.project_name}</span>
              {inv.project_key && (
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  {inv.project_key}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => handle(inv.id, "reject")}
              >
                Refuser
              </Button>
              <Button size="sm" disabled={busy} onClick={() => handle(inv.id, "accept")}>
                {busy && <Spinner />}
                Rejoindre
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
