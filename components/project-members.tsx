"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Input, Spinner, toast } from "mangue-ui";
import { UserPlus, X } from "lucide-react";
import { useMembersQuery } from "@/lib/use-members-query";
import { UserAvatar } from "@/components/user-avatar";
import { displayName as resolveDisplayName } from "@/lib/display-name";
import type { Member } from "@/lib/types";

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
  const t = useTranslations("Members");
  const tc = useTranslations("Common");
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
      toast.success(t("invitationSent", { email: value }));
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
              {t("inviteByEmail")}
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("invitePlaceholder")}
            />
          </div>
          <Button type="submit" disabled={inviting}>
            {inviting ? <Spinner /> : <UserPlus />}
            {t("invite")}
          </Button>
        </form>
      )}
      {isOwner && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("inviteHint")}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("membersLabel")}</p>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-2">
                <UserAvatar
                  url={m.avatar_url}
                  name={displayName(m)}
                  seed={m.user_id}
                  className="size-8 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(m)}</p>
                  {m.email && m.full_name && (
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  )}
                </div>
                {m.is_owner ? (
                  <Badge variant="secondary">{t("owner")}</Badge>
                ) : (
                  isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("removeMemberAria")}
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
          <p className="text-sm font-medium">{t("pendingInvitations")}</p>
          <ul className="flex flex-col divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.invited_email}</p>
                </div>
                <Badge variant="outline">{t("pending")}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("cancelInvitationAria")}
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
