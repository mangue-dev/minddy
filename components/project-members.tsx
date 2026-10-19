"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CrownIcon,
  MoreHorizontalIcon,
  UserAdd01Icon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMembersQuery } from "@/lib/use-members-query";
import { usePlanGates } from "@/lib/use-billing-query";
import {
  SettingsEmpty,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import { UserAvatar } from "@/components/user-avatar";
import { displayName as resolveDisplayName } from "@/lib/display-name";
import { isMemberRole, type MemberRole, type ProjectRole } from "@/lib/project-roles";
import type { Member } from "@/lib/types";

function displayName(m: Member): string {
  return resolveDisplayName(m);
}

type MembersT = ReturnType<typeof useTranslations<"Members">>;

function roleLabel(t: MembersT, role: ProjectRole): string {
  if (role === "owner") return t("owner");
  return role === "reader" ? t("roleReader") : t("roleMember");
}

/**
 * Trigger shapes: `badge` matches the Owner badge it sits next to in member
 * and invitation rows; `field` matches the Invite button of the invite form.
 * The `data-[size=…]` overrides are needed because the trigger sets its
 * height and radius through those variants.
 */
const ROLE_TRIGGER_CLASS = {
  badge:
    "w-auto gap-1 rounded-full px-2 py-1.5 text-xs md:text-xs font-medium leading-none data-[size=sm]:h-7 data-[size=sm]:md:h-7 data-[size=sm]:rounded-full [&_svg]:size-3.5",
  field:
    "w-auto gap-1.5 rounded-full px-3 font-medium data-[size=default]:h-9 data-[size=default]:md:h-9",
} as const;

/** Compact Member/Reader picker shared by members, invitations and the invite form. */
function RoleSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  id,
  shape = "badge",
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  disabled?: boolean;
  ariaLabel: string;
  id?: string;
  shape?: keyof typeof ROLE_TRIGGER_CLASS;
}) {
  const t = useTranslations("Members");
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (isMemberRole(v)) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={shape === "badge" ? "sm" : "default"}
        className={ROLE_TRIGGER_CLASS[shape]}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">{t("roleMember")}</SelectItem>
        <SelectItem value="reader">{t("roleReader")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** The reader-only "Can comment" option, shown under the row it belongs to. */
function CanCommentToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Members");
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 pb-3 pl-11">
      <label htmlFor={id} className="flex min-w-0 flex-col">
        <span className="text-sm">{t("canComment")}</span>
        <span className="text-xs text-muted-foreground">{t("canCommentHint")}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
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
  const {
    members,
    invitations,
    isOwner,
    loading,
    invite,
    cancelInvitation,
    removeMember,
    updateMemberRole,
    updateInvitationRole,
    transferOwnership,
  } = useMembersQuery(projectId, enabled);
  // The plan caps project guests rather than collaboration itself (MIN-199),
  // so the form remains visible with a counter and disables only when the last
  // slot is occupied. This mirrors the server RPC: non-owner members (readers
  // included) plus live pending invitations.
  const { maxMembersPerProject } = usePlanGates();
  const guestsUsed =
    members.filter((m) => !m.is_owner).length + invitations.length;
  // A project can exceed its ceiling (expired subscription): we cannot withdraw
  // person, we only refuse the next one — hence the `>=`.
  const limitReached =
    maxMembersPerProject != null && guestsUsed >= maxMembersPerProject;

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteCanComment, setInviteCanComment] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Removing a member is irreversible on the server side (the `project_members` line
  // is deleted): we go through an explicit confirmation.
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  // Demotion unassigns the person's open issues, so it is confirmed too.
  const [demoteTarget, setDemoteTarget] = useState<Member | null>(null);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setInviting(true);
    try {
      await invite(value, {
        role: inviteRole,
        can_comment: inviteRole === "reader" && inviteCanComment,
      });
      toast.success(t("invitationSent", { email: value }));
      setEmail("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  /** Returns `false` if the call failed — the caller then keeps its dialog open. */
  const withBusy = async (id: string, fn: () => Promise<unknown>) => {
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

  const changeRole = (m: Member, role: MemberRole) => {
    if (role === m.role) return;
    if (role === "reader") {
      setDemoteTarget(m);
      return;
    }
    void withBusy(m.user_id, () =>
      updateMemberRole(m.user_id, { role, can_comment: false })
    );
  };

  const isBusy = (id: string | undefined) => id !== undefined && busyId === id;

  return (
    <div className="flex flex-col gap-4">
      {isOwner && (
        <>
          <form onSubmit={handleInvite} className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
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
              <RoleSelect
                value={inviteRole}
                onChange={(role) => {
                  setInviteRole(role);
                  if (role !== "reader") setInviteCanComment(false);
                }}
                disabled={limitReached}
                ariaLabel={t("inviteRoleAria")}
                shape="field"
              />
              <Button type="submit" disabled={inviting || limitReached}>
                {inviting ? <Spinner /> : <HugeiconsIcon icon={UserAdd01Icon} />}
                {t("invite")}
              </Button>
            </div>
            {inviteRole === "reader" && (
              <CanCommentToggle
                checked={inviteCanComment}
                onChange={setInviteCanComment}
                disabled={limitReached}
              />
            )}
          </form>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t("inviteHint")} {t("rolesHint")}
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
            {members.map((m) => {
              const manageable = isOwner && !m.is_owner;
              const busy = isBusy(m.user_id);
              return (
                <div key={m.user_id} className="flex flex-col">
                  <SettingsListRow
                    avatar={<UserAvatar seed={m.avatar_seed} className="size-8" />}
                    title={displayName(m)}
                    subtitle={m.email && m.full_name ? m.email : undefined}
                    action={
                      manageable ? (
                        <>
                          {busy && <Spinner />}
                          <RoleSelect
                            value={m.role === "reader" ? "reader" : "member"}
                            onChange={(role) => changeRole(m, role)}
                            disabled={busy}
                            ariaLabel={t("memberRoleAria", { name: displayName(m) })}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-label={t("manageMemberAria", { name: displayName(m) })}
                              >
                                <HugeiconsIcon icon={MoreHorizontalIcon} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {m.role === "member" && (
                                <DropdownMenuItem onSelect={() => setTransferTarget(m)}>
                                  <HugeiconsIcon icon={CrownIcon} />
                                  {t("transferOwnership")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setRemoveTarget(m)}
                              >
                                <HugeiconsIcon icon={UserRemove01Icon} />
                                {t("removeFromProject")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : (
                        <Badge variant={m.is_owner ? "secondary" : "outline"}>
                          {m.role === "reader" && m.can_comment
                            ? t("roleReaderCanComment")
                            : roleLabel(t, m.is_owner ? "owner" : m.role)}
                        </Badge>
                      )
                    }
                  />
                  {manageable && m.role === "reader" && (
                    <CanCommentToggle
                      checked={m.can_comment}
                      disabled={busy}
                      onChange={(value) =>
                        void withBusy(m.user_id, () =>
                          updateMemberRole(m.user_id, { role: "reader", can_comment: value })
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
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
            {invitations.map((inv) => {
              const busy = isBusy(inv.id);
              const role: MemberRole = inv.role === "reader" ? "reader" : "member";
              return (
                <div key={inv.id} className="flex flex-col">
                  <SettingsListRow
                    title={inv.invited_email}
                    action={
                      <>
                        <Badge variant="outline">{t("pending")}</Badge>
                        <RoleSelect
                          value={role}
                          disabled={busy}
                          ariaLabel={t("invitationRoleAria", { email: inv.invited_email })}
                          onChange={(next) =>
                            void withBusy(inv.id, () =>
                              updateInvitationRole(inv.id, { role: next, can_comment: false })
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("cancelInvitationAria")}
                          disabled={busy}
                          onClick={() => withBusy(inv.id, () => cancelInvitation(inv.id))}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} />
                        </Button>
                      </>
                    }
                  />
                  {role === "reader" && (
                    <CanCommentToggle
                      checked={inv.can_comment}
                      disabled={busy}
                      onChange={(value) =>
                        void withBusy(inv.id, () =>
                          updateInvitationRole(inv.id, { role: "reader", can_comment: value })
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
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
              disabled={isBusy(removeTarget?.user_id)}
              onClick={async () => {
                if (!removeTarget) return;
                const userId = removeTarget.user_id;
                const ok = await withBusy(userId, () => removeMember(userId));
                if (ok) setRemoveTarget(null);
              }}
            >
              {isBusy(removeTarget?.user_id) ? <Spinner /> : null}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={demoteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDemoteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("demoteTitle", {
                name: demoteTarget ? displayName(demoteTarget) : "",
              })}
            </DialogTitle>
            <DialogDescription>{t("demoteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={isBusy(demoteTarget?.user_id)}
              onClick={async () => {
                if (!demoteTarget) return;
                const userId = demoteTarget.user_id;
                const ok = await withBusy(userId, () =>
                  updateMemberRole(userId, { role: "reader", can_comment: false })
                );
                if (ok) setDemoteTarget(null);
              }}
            >
              {isBusy(demoteTarget?.user_id) ? <Spinner /> : null}
              {t("demoteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("transferTitle", {
                name: transferTarget ? displayName(transferTarget) : "",
              })}
            </DialogTitle>
            <DialogDescription>{t("transferDescription")}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t("transferBecomeMember")}</li>
            <li>{t("transferRoutinesPaused")}</li>
            <li>{t("transferPlanFollows")}</li>
            <li>{t("transferPersonalStays")}</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isBusy(transferTarget?.user_id)}
              onClick={async () => {
                if (!transferTarget) return;
                const target = transferTarget;
                let paused = 0;
                const ok = await withBusy(target.user_id, async () => {
                  paused = (await transferOwnership(target.user_id)).disabledRoutines;
                });
                if (!ok) return;
                setTransferTarget(null);
                toast.success(t("transferDone", { name: displayName(target) }), {
                  description:
                    paused > 0 ? t("transferRoutinesPausedCount", { count: paused }) : undefined,
                });
              }}
            >
              {isBusy(transferTarget?.user_id) ? <Spinner /> : null}
              {t("transferConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
