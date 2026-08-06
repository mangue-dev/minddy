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
import { UserPlus, X } from "lucide-react";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePlanGates } from "@/lib/use-billing-query";
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
  // Le plan plafonne le nombre d'INVITÉS d'un projet, il ne ferme plus la porte
  // (MIN-199) : le formulaire est donc toujours là, avec son compteur, et ne se
  // désarme qu'une fois la dernière place prise. Le compte suit celui du
  // serveur (`ensureMemberSlotAvailable`) : les membres hors owner, plus les
  // invitations encore en attente.
  const { maxMembersPerProject } = usePlanGates();
  const guestsUsed =
    members.filter((m) => !m.is_owner).length + invitations.length;
  // Un projet peut dépasser son plafond (abonnement expiré) : on ne retire
  // personne, on refuse seulement la suivante — d'où le `>=`.
  const limitReached =
    maxMembersPerProject != null && guestsUsed >= maxMembersPerProject;

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
      {isOwner && (
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
                disabled={limitReached}
              />
            </div>
            <Button type="submit" disabled={inviting || limitReached}>
              {inviting ? <Spinner /> : <UserPlus />}
              {t("invite")}
            </Button>
          </form>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("inviteHint")}
          </p>
          {/* Tant que la liste charge, `guestsUsed` vaut 0 parce qu'on n'a
              encore RIEN reçu — pas parce que le projet est vide. Afficher le
              compteur là annoncerait « 0 invité sur 2 » à un projet plein, une
              demi-seconde, à chaque ouverture de l'onglet. */}
          {!loading && maxMembersPerProject != null && (
            <p className="-mt-3 text-xs text-muted-foreground">
              {limitReached ? (
                <>
                  {t("inviteLimitReached", { limit: maxMembersPerProject })}{" "}
                  <Link
                    href="/billing"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {tb("membersGateCta")}
                  </Link>
                </>
              ) : (
                <span className="tabular-nums">
                  {t("guestCount", {
                    used: guestsUsed,
                    limit: maxMembersPerProject,
                  })}
                </span>
              )}
            </p>
          )}
        </>
      )}

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
                    {/* Deux attentes différentes (MIN-197) : une invitation
                        sans `invited_user_id` attend une INSCRIPTION, pas une
                        réponse — dire « en attente » des deux laisserait croire
                        que la personne a vu l'invitation et ne répond pas. */}
                    <Badge variant="outline">
                      {inv.invited_user_id ? t("pending") : t("pendingSignup")}
                    </Badge>
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
