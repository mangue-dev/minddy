"use client";

import { useState } from "react";
import { Badge, Button, Input, Spinner, toast } from "mangue-ui";
import { UserPlus, X } from "lucide-react";
import { useMembersQuery } from "@/lib/use-members-query";
import { initials as toInitials } from "@/lib/avatar";
import { displayName as resolveDisplayName } from "@/lib/display-name";
import type { Member } from "@/lib/types";

function initials(m: Member): string {
  return toInitials(resolveDisplayName(m, "?"));
}

function displayName(m: Member): string {
  return resolveDisplayName(m);
}

export function ProjectMembers({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const { members, invitations, isOwner, loading, invite, cancelInvitation, removeMember } =
    useMembersQuery(projectId, enabled);

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setInviting(true);
    try {
      await invite(value);
      toast.success(`Invitation envoyée à ${value}.`);
      setEmail("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isOwner && (
        <form onSubmit={handleInvite} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Inviter par email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collegue@exemple.com"
            />
          </div>
          <Button type="submit" disabled={inviting}>
            {inviting ? <Spinner /> : <UserPlus />}
            Inviter
          </Button>
        </form>
      )}
      {isOwner && (
        <p className="-mt-2 text-xs text-muted-foreground">
          L&apos;invité doit déjà avoir un compte minddy ; il verra l&apos;invitation
          sur sa page d&apos;accueil.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Membres</p>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {initials(m)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(m)}</p>
                  {m.email && m.full_name && (
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  )}
                </div>
                {m.is_owner ? (
                  <Badge variant="secondary">Propriétaire</Badge>
                ) : (
                  isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Retirer le membre"
                      disabled={busyId === m.user_id}
                      onClick={() =>
                        withBusy(m.user_id, () => removeMember(m.user_id))
                      }
                    >
                      <X />
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isOwner && invitations.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Invitations en attente</p>
          <ul className="flex flex-col divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.invited_email}</p>
                </div>
                <Badge variant="outline">En attente</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Annuler l'invitation"
                  disabled={busyId === inv.id}
                  onClick={() => withBusy(inv.id, () => cancelInvitation(inv.id))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
