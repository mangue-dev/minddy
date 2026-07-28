"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Input, Spinner, toast } from "mangue-ui";
import { UserPlus, Users, X } from "lucide-react";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePlanGates } from "@/lib/use-billing-query";
import { EmptyState } from "@/components/empty-state";
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
  const tb = useTranslations("Billing");
  const { members, invitations, isOwner, loading, invite, cancelInvitation, removeMember } =
    useMembersQuery(projectId, enabled);
  // Le travail en équipe est un verrou de plan (Pro) : côté serveur
  // `inviteMember` refuse déjà en 403 `membersProOnly` — l'UI ne doit pas
  // proposer un formulaire dont l'envoi ne peut que échouer. La LISTE reste
  // visible : un projet peut garder des membres d'un abonnement expiré, et
  // son propriétaire doit pouvoir les voir et les retirer.
  const { membersAllowed } = usePlanGates();

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
      {isOwner &&
        (membersAllowed ? (
          <>
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
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("inviteHint")}
            </p>
          </>
        ) : (
          <EmptyState
            className="px-6 py-8"
            icon={<Users className="size-6" />}
            title={tb("membersGateTitle")}
            description={tb("membersGateDescription")}
            action={
              <Button asChild size="sm">
                <Link href="/billing">{tb("membersGateCta")}</Link>
              </Button>
            }
          />
        ))}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("membersLabel")}</p>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-2">
                <UserAvatar
                  seed={m.avatar_seed}
                  className="size-8"
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
