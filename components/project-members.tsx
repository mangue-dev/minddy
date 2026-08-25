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
  // The plan caps project guests rather than collaboration itself (MIN-199),
  // so the form remains visible with a counter and disables only when the last
  // slot is occupied. This mirrors the server RPC: non-owner members plus live
  // pending invitations.
  const { maxMembersPerProject } = usePlanGates();
  const guestsUsed =
    members.filter((m) => !m.is_owner).length + invitations.length;
  // A project can exceed its ceiling (expired subscription): we cannot withdraw
  // person, we only refuse the next one — hence the `>=`.
  const limitReached =
    maxMembersPerProject != null && guestsUsed >= maxMembersPerProject;

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Removing a member is irreversible on the server side (the `project_members` line
  // is deleted): we go through an explicit confirmation.
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

  /** Returns `false` if the call failed — the caller then keeps its dialog open. */
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
          {/* As long as the list loads, `guestsUsed` is 0 because we haven't received ANYTHING yet — not because the project is empty. Showing the
 counter there would announce "0 guests of 2" to a full project, a half second, each time the tab is opened. */}
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
          {/* The wait is said ONCE, for the entire list, and never by
 line (MIN-197). A status per line — “waiting for registration”
 versus “waiting for response” — would answer the question “does this
 address have a minddy account?” » for any address
 that we enter: an account enumeration oracle. The inviter needs to know that an invitation can wait for a registration; he does not need to know WHICH one does. */}
          <p className="text-xs text-muted-foreground">
            {t("pendingInvitationsHint")}
          </p>
          <div className="mt-1 flex flex-col divide-y divide-border">
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
