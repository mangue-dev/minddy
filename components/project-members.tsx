"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import { UserPlus, Users, X } from "lucide-react";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePlanGates } from "@/lib/use-billing-query";
import { EmptyState } from "@/components/empty-state";
import {
  SettingsEmpty,
  SettingsListRow,
} from "@/components/settings/settings-ui";
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
  // Retirer un membre est irréversible côté serveur (la ligne `project_members`
  // est supprimée) : on passe par une confirmation explicite.
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

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

  /** Renvoie `false` si l'appel a échoué — l'appelant garde alors son dialogue ouvert. */
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
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
          <SettingsEmpty>{tc("loading")}</SettingsEmpty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <SettingsListRow
                key={m.user_id}
                avatar={<UserAvatar seed={m.avatar_seed} className="size-8" />}
                title={displayName(m)}
                subtitle={m.email && m.full_name ? m.email : undefined}
                action={
                  m.is_owner ? (
                    <Badge variant="secondary">{t("owner")}</Badge>
                  ) : (
                    isOwner && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busyId === m.user_id}
                        onClick={() => setRemoveTarget(m)}
                      >
                        {t("remove")}
                      </Button>
                    )
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {isOwner && invitations.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("pendingInvitations")}</p>
          <div className="flex flex-col divide-y divide-border">
            {invitations.map((inv) => (
              <SettingsListRow
                key={inv.id}
                title={inv.invited_email}
                action={
                  <>
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
                  </>
                }
              />
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("removeMemberTitle", {
                name: removeTarget ? displayName(removeTarget) : "",
              })}
            </DialogTitle>
            <DialogDescription>{t("removeMemberDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={removeTarget !== null && busyId === removeTarget.user_id}
              onClick={async () => {
                if (!removeTarget) return;
                const userId = removeTarget.user_id;
                const ok = await withBusy(userId, () => removeMember(userId));
                if (ok) setRemoveTarget(null);
              }}
            >
              {removeTarget !== null && busyId === removeTarget.user_id ? (
                <Spinner />
              ) : null}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
