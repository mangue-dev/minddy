"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { EyeOff, RotateCcw, Search, Undo2, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { BILLING_PLANS, type BillingPlanId } from "@/lib/billing-plans";
import type { AdminUserRow, AdminUsersResponse } from "@/lib/types";

/**
 * `/admin` → onglet « Utilisateurs » (MIN-90) : LA vue des comptes de l'app.
 * Une ligne par compte — onboarding, projets, tickets, plan, inscription,
 * dernier signe de vie — et un panneau qui rassemble TOUTES les actions
 * d'administration sur ce compte.
 *
 * Ce panneau remplace deux anciens onglets. C'était le vrai défaut du dashboard :
 * « Quotas » ne listait que les comptes ayant consommé de l'IA ce mois-ci, et
 * « Facturation » exigeait de connaître l'email par cœur avant de pouvoir agir.
 * Les deux endpoints (`/api/admin/agent-quota`, `/api/admin/billing`) n'ont pas
 * bougé : ils sont simplement appelés depuis la ligne du compte concerné.
 *
 * La remise à zéro conserve sa nuance d'origine, essentielle : elle ne supprime
 * AUCUN coût. Le panneau montre donc les deux montants — ce que le budget compte
 * (fenêtre réelle + filigrane) et la dépense réelle du mois, intacte.
 *
 * Seul écran de l'app où l'email brut s'affiche : c'est l'identifiant avec
 * lequel un admin travaille, et l'accès est verrouillé côté serveur
 * (`app/(app)/admin/layout.tsx` + `isAdminUser` sur chaque route).
 */

const PAGE_SIZE = 25;
const NO_OVERRIDE = "none";

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Avancement de l'onboarding en quatre pastilles — lisible d'un coup d'œil.
 *  Le déclencheur est un `span` (et non le bouton par défaut de Tooltip) :
 *  la pastille vit DANS le bouton de la ligne, et un bouton dans un bouton est
 *  du HTML invalide. `aria-label` porte l'information au clavier. */
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

/** Une mesure de ligne : le chiffre au-dessus, son libellé en dessous. */
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
  const overridden = user.billing.source === "admin_override";
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
      <TooltipContent>{t(`billing.source_${user.billing.source}`)}</TooltipContent>
    </Tooltip>
  );
}

/** Marque « compte interne » : présent dans la liste, absent des statistiques. */
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

/** Panneau d'un compte : sa fiche complète et toutes les actions admin. */
function UserSheet({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  onChanged: (updated: Partial<AdminUserRow> & { userId: string }) => void;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [override, setOverride] = useState<string>(NO_OVERRIDE);
  const [note, setNote] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [busyQuota, setBusyQuota] = useState(false);
  const [savingInternal, setSavingInternal] = useState(false);

  // Le panneau se remplit à chaque ouverture (et à chaque compte suivant).
  useEffect(() => {
    setOverride(user?.billing.override ?? NO_OVERRIDE);
    setNote(user?.billing.overrideNote ?? "");
  }, [user?.userId, user?.billing.override, user?.billing.overrideNote]);

  if (!user) return null;

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
        }),
      });
      const data = (await response.json()) as {
        planId?: BillingPlanId;
        source?: AdminUserRow["billing"]["source"];
        override?: BillingPlanId | null;
        note?: string | null;
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

  const setQuotaReset = async (reset: boolean) => {
    if (busyQuota) return;
    setBusyQuota(true);
    try {
      const response = reset
        ? await fetch("/api/admin/agent-quota", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.userId }),
          })
        : await fetch(`/api/admin/agent-quota?userId=${user.userId}`, {
            method: "DELETE",
          });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { resetAt?: string };
      onChanged({
        userId: user.userId,
        usage: {
          ...user.usage,
          resetAt: reset ? (data.resetAt ?? new Date().toISOString()) : null,
          // La remise à zéro libère le budget compté ; la dépense réelle du
          // mois, elle, ne bouge pas — c'est tout l'intérêt du filigrane.
          spentUsd: reset ? 0 : user.usage.spentUsd,
          blocked: reset ? false : user.usage.blocked,
        },
      });
      toast.success(
        reset
          ? t("quotas.resetToast", { name: user.name })
          : t("quotas.undoToast", { name: user.name }),
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

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex !w-full flex-col gap-0 sm:!w-[92%] sm:!max-w-[520px]"
      >
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle className="flex items-center gap-2.5">
            <UserAvatar
              seed={user.avatarSeed}
              className="size-7"
            />
            <span className="truncate">{user.name}</span>
            {user.internal ? <InternalBadge /> : null}
          </SheetTitle>
          <SheetDescription className="truncate">
            {user.email ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {/* ── Le compte en chiffres ─────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: t("users.projects"), value: user.projects },
              { label: t("users.projectsOwned"), value: user.projectsOwned },
              { label: t("users.issues"), value: user.issues },
              { label: t("users.issuesCreated"), value: user.issuesCreated },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {item.value}
                </span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </section>

          <section className="space-y-2 rounded-xl border border-border p-3">
            <Row label={t("users.signedUp")} value={dt(user.createdAt)} />
            <Row label={t("users.lastSignIn")} value={dt(user.lastSignInAt)} />
            <Row label={t("users.lastActivity")} value={dt(user.lastActivityAt)} />
            <Row
              label={t("users.emailStatus")}
              value={
                user.emailConfirmed ? t("users.confirmed") : t("users.unconfirmed")
              }
            />
          </section>

          {/* ── Compte interne ─────────────────────────────────────────── */}
          <section className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t("users.internalTitle")}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("users.internalSubtitle")}
              </p>
            </div>
            {savingInternal ? (
              <Spinner className="mt-1 shrink-0" />
            ) : (
              <Switch
                checked={user.internal}
                onCheckedChange={(next) => void toggleInternal(next)}
                aria-label={t("users.internalTitle")}
                className="mt-1 shrink-0"
              />
            )}
          </section>

          {/* ── Onboarding ─────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("users.onboardingTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {user.onboarding.dismissed
                ? t("users.onboardingDismissed", {
                    done: user.onboarding.completed,
                    total: user.onboarding.total,
                  })
                : user.onboarding.started
                  ? t("users.onboardingProgress", {
                      done: user.onboarding.completed,
                      total: user.onboarding.total,
                    })
                  : t("users.onboardingNeverSeen")}
            </p>
            {/* L'étape en cours ne veut rien dire pour un compte à qui
                l'onboarding n'a jamais été montré — il n'en a franchi aucune
                et n'en franchira pas : ne pas lui inventer une progression. */}
            {user.onboarding.started && user.onboarding.currentStep ? (
              <p className="text-xs text-muted-foreground">
                {t("users.onboardingCurrent", {
                  step: t(`users.step_${user.onboarding.currentStep}`),
                })}
              </p>
            ) : null}
          </section>

          {/* ── Budget d'usage + remise à zéro ─────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t("users.usageTitle")}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("users.usageSubtitle")}
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    user.usage.blocked && "text-destructive",
                  )}
                >
                  {fmtCost(user.usage.spentUsd)} / ${user.usage.budgetUsd}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("quotas.counted")}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    user.usage.blocked ? "bg-destructive" : "bg-foreground/70",
                  )}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {fmtCost(user.usage.spentMonthUsd)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("quotas.realSpend")} · {t("quotas.calls", { count: user.usage.calls })}
                </span>
              </div>
            </div>

            {user.usage.resetAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {t("quotas.resetOn", { at: dt(user.usage.resetAt) })}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void setQuotaReset(false)}
                  disabled={busyQuota}
                >
                  {busyQuota ? <Spinner /> : <Undo2 className="size-3.5" />}
                  {t("quotas.undo")}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void setQuotaReset(true)}
                disabled={busyQuota}
              >
                {busyQuota ? <Spinner /> : <RotateCcw className="size-3.5" />}
                {t("quotas.reset")}
              </Button>
            )}
          </section>

          {/* ── Plan + override admin ──────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t("billing.title")}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("billing.subtitle")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {t("billing.effectivePlan", { plan: user.billing.planId })}
              </Badge>
              <Badge variant="outline">
                {t(`billing.source_${user.billing.source}`)}
              </Badge>
              {user.billing.stripePlanId && user.billing.source !== "stripe" ? (
                <span className="text-xs text-muted-foreground">
                  {t("billing.stripeUnderneath", { plan: user.billing.stripePlanId })}
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("billing.overrideLabel")}
                </label>
                <Select value={override} onValueChange={setOverride}>
                  <SelectTrigger size="sm" className="w-48">
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
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("billing.noteLabel")}
                </label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("billing.notePlaceholder")}
                  disabled={override === NO_OVERRIDE}
                />
              </div>
              <Button size="sm" onClick={() => void savePlan()} disabled={savingPlan}>
                {savingPlan ? <Spinner /> : null}
                {t("billing.save")}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Une ligne libellé / valeur du panneau. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function AdminUsersDashboard() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Le rendu en cours de vol ; une frappe rapide ne doit pas laisser une
  // réponse tardive écraser une recherche plus récente.
  const requestRef = useRef(0);

  // Recherche débouncée : le serveur pagine, on ne filtre pas côté client.
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

  /** Une action du panneau a changé le compte : on rafraîchit SA ligne. */
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
        onClose={() => setSelectedId(null)}
        onChanged={applyChange}
      />
    </div>
  );
}
