"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import {
  EyeOff,
  Gauge,
  Gift,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { BILLING_PLANS, type BillingPlanId } from "@/lib/billing-plans";
import {
  DEFAULT_GIFT_DURATION,
  GIFT_DURATIONS,
  giftExpiresAt,
  type GiftDuration,
} from "@/lib/billing-gift";
import type {
  AdminQuotaReset,
  AdminQuotaResetsResponse,
  AdminUserRow,
  AdminUsersResponse,
} from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";
import { useAdminCapabilities } from "@/lib/use-admin-capabilities";
import { giftSectionVisible } from "@/lib/admin-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `/admin` → “Users” tab (MIN-90): THE view of the app’s accounts.
 * One line per account — onboarding, projects, tickets, plan, registration,
 * last sign of life — and a panel that brings together ALL the actions
 * administration on this account.
 *
 * This panel replaces two old tabs. This was the real fault of the dashboard:
 * “Quotas” only listed accounts that had consumed AI this month, and
 * “Billing” required knowing the email by heart before you could act.
 * The two endpoints (`/api/admin/agent-quota`, `/api/admin/billing`) do not have
 * moved: they are simply called from the line of the account concerned.
 *
 * Resetting retains its original, essential nuance: it does not delete
 * NO cost. The panel therefore shows the two amounts — what the budget counts
 * (real window + watermark) and the actual expense of the month, intact.
 *
 * It now STACKS (20261105): several per billing period, and
 * the panel keeps the register. It is the most recent which sets the start of the
 * window counted — the previous ones are behind it and no longer release anything;
 * they only say how much has already been offered to this account over the period,
 * which is exactly what we want to know before offering one more.
 *
 * The panel follows the SETTINGS GRAMMAR (`components/settings/settings-ui`,
 * MIN-167), such as the “Models” tab. He didn't always do it, and that's
 * saw: six sections all in `text-sm font-semibold`, some lined and
 * other bare ones, each followed by its explanatory paragraph — nothing said
 * which was a title, a fact or a gesture. The same information holds
 * now in three row cards “label on the left · value on the right”,
 * and prose (what an internal account ceases to feed, what a reset
 * zero does not erase) has gone behind the ⓘ, where we read it when we
 * look for. At the top, what identifies the account: avatar, name, email, then
 * its state dots on their own line — attached to the title, they
 * truncated as soon as a name was long.
 *
 * Only screen of the app where the raw email is displayed: it is the identifier with
 * which an admin works, and access is locked on the server side
 * (`app/(app)/admin/layout.tsx` + `isAdminUser` on each route).
 *
 * GDPR audit (MIN-416): every datum here is either an admin ACTION target
 * (email, plan override, quota reset, internal flag) or a counter without
 * personal content (projects, tickets, spend). No IP address, no session
 * log, no message or ticket body ever reaches this screen, and lifecycle
 * timestamps are limited to what support needs (registered / last sign-in /
 * last activity). Nothing to remove without breaking an action above.
 */

const PAGE_SIZE = 25;
const NO_OVERRIDE = "none";
/** Duration selector value that sends NO duration: the deadline in place
 * don't move. Only offered when a gift is already in progress — otherwise
 *  “do not change” would change nothing at all. */
const KEEP_DURATION = "keep";

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Progress of onboarding in four tablets — readable at a glance.
 * The trigger is a `span` (not the default Tooltip button):
 * the pellet lives IN the button of the line, and a button within a button is
 *  invalid HTML. `aria-label` carries the information to the keyboard. */
function OnboardingPips({ user }: { user: AdminUserRow }) {
  const t = useTranslations("Admin");
  const { completed, total, started, dismissed } = user.onboarding;
  const label = dismissed
    ? t("users.onboardingDismissed", { done: completed, total })
    : started
      ? t("users.onboardingProgress", { done: completed, total })
      : t("users.onboardingNeverSeen");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center gap-1" aria-label={label}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                i < completed ? "bg-foreground/70" : "bg-border",
              )}
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{t("users.onboardingTitle")}</span>
        <span className="block text-background/70">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** A line measurement: the number above, its wording below. */
function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex w-14 flex-col items-end">
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function PlanBadge({ user }: { user: AdminUserRow }) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const overridden = user.billing.source === "admin_override";
  const until = user.billing.overrideExpiresAt;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={overridden ? "secondary" : "outline"}
          className="h-5 shrink-0 text-[10px]"
        >
          {user.billing.planId}
          {overridden ? " ·" : ""}
          {overridden ? (
            <span className="font-normal opacity-70">{t("users.overrideMark")}</span>
          ) : null}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <span>{t(`billing.source_${user.billing.source}`)}</span>
        {until ? (
          <span className="block text-background/70">
            {t("billing.giftUntil", {
              at: format.dateTime(new Date(until), {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** “Internal account” mark: present in the list, absent from the statistics. */
function InternalBadge() {
  const t = useTranslations("Admin");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="h-5 shrink-0 gap-1 text-[10px]">
          <EyeOff className="size-2.5" />
          {t("users.internalBadge")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t("users.internalSubtitle")}</TooltipContent>
    </Tooltip>
  );
}

/** Account panel: its complete profile and all admin actions. */
function UserSheet({
  user,
  giftVisible,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  /** Whether the “Gift a plan” section renders for THIS account
   * (`giftSectionVisible`, lib/admin-tabs.ts): the instance needs Stripe or
   * paid plans configured, unless an override is already in progress — it
   * then needs its section to be removable. */
  giftVisible: (user: AdminUserRow | null) => boolean;
  onClose: () => void;
  onChanged: (updated: Partial<AdminUserRow> & { userId: string }) => void;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [override, setOverride] = useState<string>(NO_OVERRIDE);
  const [duration, setDuration] = useState<string>(DEFAULT_GIFT_DURATION);
  const [note, setNote] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [busyQuota, setBusyQuota] = useState(false);
  const [savingInternal, setSavingInternal] = useState(false);
  /** The period reset register — `null` as long as it loads. */
  const [resets, setResets] = useState<AdminQuotaReset[] | null>(null);

  // The panel fills up with each opening (and with each subsequent count).
  useEffect(() => {
    setOverride(user?.billing.override ?? NO_OVERRIDE);
    setNote(user?.billing.overrideNote ?? "");
    // Gift already in progress → we do not touch its deadline by default;
    // otherwise the current duration, “1 month”.
    setDuration(user?.billing.override ? KEEP_DURATION : DEFAULT_GIFT_DURATION);
  }, [user?.userId, user?.billing.override, user?.billing.overrideNote]);

  // The register does not travel with the list of accounts: it would cost
  // one more request per line for information that can only be read here.
  const userId = user?.userId;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setResets(null);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/agent-quota?userId=${userId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as AdminQuotaResetsResponse;
        if (alive) setResets(data.resets);
      } catch {
        // The missing register should not condemn the rest of the panel: we
        // it shows empty, the “Reset” gesture remains available.
        if (alive) setResets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!user) return null;

  /** One moment: date AND time — “last connected” reads on time. */
  const dt = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  /** A deadline: the date alone. Time for a gift that ends in three months
   * learns nothing and lengthens the line by a third. */
  const day = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const savePlan = async () => {
    if (savingPlan) return;
    setSavingPlan(true);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          planId: override === NO_OVERRIDE ? null : override,
          note: note.trim() || null,
          // Duration omitted = the deadline in place does not move (the server does not
          // do not restart the countdown on a simple note correction).
          duration: duration === KEEP_DURATION ? null : duration,
        }),
      });
      const data = (await response.json()) as {
        planId?: BillingPlanId;
        source?: AdminUserRow["billing"]["source"];
        override?: BillingPlanId | null;
        note?: string | null;
        expiresAt?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error);
      onChanged({
        userId: user.userId,
        billing: {
          ...user.billing,
          planId: data.planId ?? user.billing.planId,
          source: data.source ?? user.billing.source,
          override: data.override ?? null,
          overrideNote: data.note ?? null,
          overrideExpiresAt: data.expiresAt ?? null,
        },
      });
      toast.success(t("billing.saved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPlan(false);
    }
  };

  const toggleInternal = async (next: boolean) => {
    if (savingInternal) return;
    setSavingInternal(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, internal: next }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      onChanged({ userId: user.userId, internal: next });
      toast.success(
        next
          ? t("users.internalOnToast", { name: user.name })
          : t("users.internalOffToast", { name: user.name }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingInternal(false);
    }
  };

  /**
   * Installs one more reset (`undoId` absent), or removes one.
   *
   * The server returns the recalculated state in both cases: remove a discount
   * to zero REOPENS the window on expenses that were no longer counted, and the
   * new amount cannot be guessed from here. The REAL expense of the month is not
   * never moves — that’s the whole point of the watermark.
   */
  const setQuotaReset = async (undoId?: string) => {
    if (busyQuota) return;
    setBusyQuota(true);
    try {
      const response = undoId
        ? await fetch(`/api/admin/agent-quota?id=${undoId}`, { method: "DELETE" })
        : await fetch("/api/admin/agent-quota", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.userId }),
          });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AdminQuotaResetsResponse;
      setResets(data.resets);
      onChanged({
        userId: user.userId,
        usage: {
          ...user.usage,
          resetAt: data.resets[0]?.at ?? null,
          spentUsd: data.usage.spentUsd,
          blocked: data.usage.blocked,
        },
      });
      toast.success(
        undoId
          ? t("quotas.undoToast", { name: user.name })
          : t("quotas.resetToast", { name: user.name }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyQuota(false);
    }
  };

  const ratio =
    user.usage.budgetUsd > 0
      ? Math.min(user.usage.spentUsd / user.usage.budgetUsd, 1)
      : 0;

  // Onboarding is in ONE line: where it is, and the current stage when
  // she means something (an account to which onboarding has never been
  // shown has not taken any steps and will not take any).
  const onboarding = user.onboarding.dismissed
    ? t("users.onboardingDismissed", {
        done: user.onboarding.completed,
        total: user.onboarding.total,
      })
    : user.onboarding.started
      ? t("users.onboardingProgress", {
          done: user.onboarding.completed,
          total: user.onboarding.total,
        })
      : t("users.onboardingNeverSeen");
  const currentStep =
    user.onboarding.started && user.onboarding.currentStep
      ? t("users.onboardingCurrent", {
          // The step comes from the base: key assembled at runtime.
          step: t(
            `users.step_${user.onboarding.currentStep}` as MessageKey<"Admin">,
          ),
        })
      : null;

  /** What the “Offer” button will ask: a duration does not say itself to
   *  what date it falls on. */
  const preview =
    duration === KEEP_DURATION
      ? user.billing.overrideExpiresAt
        ? t("billing.previewKeep", { at: day(user.billing.overrideExpiresAt) })
        : t("billing.previewNoEnd")
      : duration === "unlimited"
        ? t("billing.previewNoEnd")
        : t("billing.previewUntil", {
            at: day(giftExpiresAt(duration as GiftDuration) as string),
          });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex !w-full flex-col gap-0 sm:!w-[92%] sm:!max-w-[540px]"
      >
        {/* ── Who is it ───────────────────────── ────────────────────────── */}
        {/* Header on panel card surface; the body, for its part, passes into
            `bg-background` — the shell convention (gray background, maps
            white), otherwise `bg-card` cards on a `bg-card` panel
            would not come off of anything. */}
        <SheetHeader className="shrink-0 gap-3 border-b border-border pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar seed={user.avatarSeed} className="size-9 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="truncate">{user.name}</SheetTitle>
              <SheetDescription className="truncate text-xs">
                {user.email ?? "—"}
              </SheetDescription>
            </div>
          </div>
          {/* The state of the account, in tablets: the plan, what sets it apart, what
              which blocks it. Under the identity, never in its title — a badge
              stuck to the name is what truncated it. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <PlanBadge user={user} />
            {user.internal ? <InternalBadge /> : null}
            {user.usage.blocked ? (
              <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">
                {t("quotas.blocked")}
              </Badge>
            ) : null}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background p-4">
          {/* ── The count in numbers ─────────────────────────────────── */}
          {/* Nets at 1 px by `gap-px` on border background: the tiles do not
              cannot touch each other, and the value remains aligned from one column to the next.
              the other even when a label moves to the line. */}
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              { label: t("users.projects"), value: user.projects },
              { label: t("users.projectsOwned"), value: user.projectsOwned },
              { label: t("users.issues"), value: user.issues },
              { label: t("users.issuesCreated"), value: user.issuesCreated },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-1 bg-card px-3 py-2.5"
              >
                <span className="text-lg leading-none font-semibold tabular-nums">
                  {item.value}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {item.label}
                </span>
              </div>
            ))}
          </section>

          {/* ── The account ─────────────────────── ──────────────────────── */}
          <SettingsGroup
            icon={UserRound}
            title={t("users.accountTitle")}
            description={t("users.accountSubtitle")}
          >
            <SettingsRow
              label={t("users.signedUp")}
              control={<Value>{dt(user.createdAt)}</Value>}
            />
            <SettingsRow
              label={t("users.lastSignIn")}
              control={<Value>{dt(user.lastSignInAt)}</Value>}
            />
            <SettingsRow
              label={t("users.lastActivity")}
              control={<Value>{dt(user.lastActivityAt)}</Value>}
            />
            <SettingsRow
              label={t("users.emailStatus")}
              control={
                <Badge variant={user.emailConfirmed ? "secondary" : "outline"}>
                  {user.emailConfirmed
                    ? t("users.confirmed")
                    : t("users.unconfirmed")}
                </Badge>
              }
            />
            <SettingsRow
              label={t("users.onboardingTitle")}
              hint={currentStep ? `${onboarding} ${currentStep}` : onboarding}
              control={<OnboardingPips user={user} />}
            />
            <SettingsRow
              htmlFor="admin-user-internal"
              label={t("users.internalTitle")}
              hint={t("users.internalHint")}
              // The exhaustive list of what stops counting is true and
              // useful — but it's prose: it lives behind the ⓘ.
              help={t("users.internalSubtitle")}
              control={
                <>
                  {/* The switch remains in place while writing: the
                      replacing with the spinner would point the label to a
                      `id` disappeared, and skip the line. */}
                  {savingInternal ? <Spinner /> : null}
                  <Switch
                    id="admin-user-internal"
                    checked={user.internal}
                    disabled={savingInternal}
                    onCheckedChange={(next) => void toggleInternal(next)}
                  />
                </>
              }
            />
          </SettingsGroup>

          {/* ── Budget d'usage ────────────────────────────────────────── */}
          <SettingsGroup
            icon={Gauge}
            title={t("users.usageTitle")}
            description={t("users.usageDescription")}
            help={t("users.usageSubtitle")}
            // How much has already been offered over this period: that is the question
            // that we ask ourselves before offering one more, so it is
            // left of the button that does it.
            footer={
              <>
                {resets && resets.length > 0 ? (
                  <span className="mr-auto text-xs text-muted-foreground">
                    {t("quotas.resetsCount", { count: resets.length })}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void setQuotaReset()}
                  disabled={busyQuota}
                >
                  {busyQuota ? <Spinner /> : <RotateCcw className="size-3.5" />}
                  {t("quotas.reset")}
                </Button>
              </>
            }
          >
            <SettingsRow
              label={t("quotas.counted")}
              control={
                <Value
                  className={cn(user.usage.blocked && "text-destructive")}
                >
                  {fmtCost(user.usage.spentUsd)} / ${user.usage.budgetUsd}
                </Value>
              }
            >
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    user.usage.blocked ? "bg-destructive" : "bg-foreground/70",
                  )}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
            </SettingsRow>
            {/* The actual expense for the month NEVER moves from a reset:
                that's the whole point of showing it next to the count. */}
            <SettingsRow
              label={t("quotas.realSpend")}
              hint={t("quotas.calls", { count: user.usage.calls })}
              control={<Value>{fmtCost(user.usage.spentMonthUsd)}</Value>}
            />
            {/* The register of the period. Nothing to show as long as no discount
                zero has been placed: an empty row would make noise to say
                that nothing happened. */}
            {resets && resets.length > 0 ? (
              <SettingsRow
                label={t("quotas.resetsTitle")}
                hint={t("quotas.resetsHint")}
                orientation="vertical"
              >
                <ul className="flex flex-col gap-1.5">
                  {resets.map((entry, index) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
                    >
                      <RotateCcw className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs tabular-nums">
                        {dt(entry.at)}
                      </span>
                      {/* The most recent is the ONLY one that still matters: the
                          others are behind her, they no longer release
                          Nothing. Saying this avoids reading the stack as a cumulation. */}
                      {index === 0 ? (
                        <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">
                          {t("quotas.resetActive")}
                        </Badge>
                      ) : null}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={t("quotas.undoOne")}
                        onClick={() => void setQuotaReset(entry.id)}
                        disabled={busyQuota}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </SettingsRow>
            ) : null}
          </SettingsGroup>

          {/* ── Plan: offer, for a time or without limit ───────────── */}
          {giftVisible(user) ? (
          <SettingsGroup
            icon={Gift}
            title={t("billing.title")}
            description={t("billing.subtitle")}
            help={t("billing.help")}
            footer={
              <Button size="sm" onClick={() => void savePlan()} disabled={savingPlan}>
                {savingPlan ? <Spinner /> : null}
                {override === NO_OVERRIDE
                  ? t("billing.stopGift")
                  : t("billing.gift")}
              </Button>
            }
          >
            <SettingsRow
              label={t("billing.planLabel")}
              hint={
                user.billing.override
                  ? user.billing.overrideExpiresAt
                    ? t("billing.giftUntil", {
                        at: day(user.billing.overrideExpiresAt),
                      })
                    : t("billing.giftNoEnd")
                  : user.billing.stripePlanId && user.billing.source !== "stripe"
                    ? t("billing.stripeUnderneath", {
                        plan: user.billing.stripePlanId,
                      })
                    : undefined
              }
              control={
                <>
                  <Badge variant="secondary">{user.billing.planId}</Badge>
                  <Badge variant="outline">
                    {t(`billing.source_${user.billing.source}`)}
                  </Badge>
                </>
              }
            />
            <SettingsRow
              htmlFor="admin-gift-plan"
              label={t("billing.overrideLabel")}
              control={
                <Select value={override} onValueChange={setOverride}>
                  <SelectTrigger id="admin-gift-plan" size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_OVERRIDE}>
                      {t("billing.overrideNone")}
                    </SelectItem>
                    {BILLING_PLANS.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              htmlFor="admin-gift-duration"
              label={t("billing.durationLabel")}
              hint={override === NO_OVERRIDE ? undefined : preview}
              control={
                <Select
                  value={duration}
                  onValueChange={setDuration}
                  disabled={override === NO_OVERRIDE}
                >
                  <SelectTrigger
                    id="admin-gift-duration"
                    size="sm"
                    className="w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* “Do not change” only makes sense on a gift already in
                        course — and this is then the default choice. */}
                    {user.billing.override ? (
                      <SelectItem value={KEEP_DURATION}>
                        {t("billing.durationKeep")}
                      </SelectItem>
                    ) : null}
                    {GIFT_DURATIONS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {/* Key assembled from the duration list. */}
                        {t(`billing.duration_${id}` as MessageKey<"Admin">)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              htmlFor="admin-gift-note"
              label={t("billing.noteLabel")}
              orientation="vertical"
              control={
                <Input
                  id="admin-gift-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("billing.notePlaceholder")}
                  disabled={override === NO_OVERRIDE}
                />
              }
            />
          </SettingsGroup>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The value of a row: a fact, right-aligned, never truncated in the middle. */
function Value({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-sm tabular-nums", className)}>{children}</span>
  );
}


export function AdminUsersDashboard() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  // The “Gift a plan” section only exists when the instance can honor it
  // (Stripe or paid plans configured, MIN-416); an override already in
  // progress keeps its section regardless, so it stays removable.
  const billingAvailable = useAdminCapabilities().configured("managedBilling");
  const giftVisible = useCallback(
    (user: AdminUserRow | null) => giftSectionVisible(billingAvailable, !!user?.billing.override),
    [billingAvailable],
  );
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Rendering during flight; a quick keystroke should not leave a
  // late reply overwrite a newer search.
  const requestRef = useRef(0);

  // Search debunked: the server pages, we do not filter on the client side.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      const token = ++requestRef.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (query) params.set("search", query);
        const response = await fetch(`/api/admin/users?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as AdminUsersResponse;
        if (token !== requestRef.current) return;
        setUsers((prev) => (offset === 0 ? data.users : [...prev, ...data.users]));
        setTotal(data.total);
        setError(null);
      } catch (err) {
        if (token === requestRef.current) setError((err as Error).message);
      } finally {
        if (token === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const selected = useMemo(
    () => users.find((u) => u.userId === selectedId) ?? null,
    [users, selectedId],
  );

  /** An action on the panel changed the account: we refresh ITS line. */
  const applyChange = useCallback(
    (patch: Partial<AdminUserRow> & { userId: string }) => {
      setUsers((prev) =>
        prev.map((u) => (u.userId === patch.userId ? { ...u, ...patch } : u)),
      );
    },
    [],
  );

  const day = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), {
          day: "numeric",
          month: "short",
          year: "2-digit",
        })
      : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("users.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("users.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("users.searchPlaceholder")}
            className="pl-8"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("users.clearSearch")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {t("users.count", { count: total })}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("users.empty")}</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {users.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setSelectedId(u.userId)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50"
              >
                <UserAvatar
                  seed={u.avatarSeed}
                  className="size-8"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{u.name}</span>
                    <PlanBadge user={u} />
                    {u.internal ? <InternalBadge /> : null}
                    {u.usage.blocked ? (
                      <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">
                        {t("quotas.blocked")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {u.email ?? "—"}
                  </span>
                </div>

                <OnboardingPips user={u} />

                <div className="hidden items-center gap-4 sm:flex">
                  <Cell value={u.projects} label={t("users.projectsShort")} />
                  <Cell value={u.issues} label={t("users.issuesShort")} />
                </div>

                <div className="hidden w-24 flex-col items-end sm:flex">
                  <span className="text-xs tabular-nums">{day(u.createdAt)}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {t("users.seen", { at: day(u.lastActivityAt) })}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {users.length < total ? (
            <Button
              variant="outline"
              size="sm"
              className="self-center"
              disabled={loadingMore}
              onClick={() => void load(users.length)}
            >
              {loadingMore ? <Spinner /> : null}
              {t("users.loadMore")}
            </Button>
          ) : null}
        </>
      )}

      <UserSheet
        user={selected}
        giftVisible={giftVisible}
        onClose={() => setSelectedId(null)}
        onChanged={applyChange}
      />
    </div>
  );
}
