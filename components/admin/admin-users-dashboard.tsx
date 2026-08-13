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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
 * Elle s'EMPILE désormais (20261105) : plusieurs par période de facturation, et
 * le panneau en tient le registre. C'est la plus récente qui fixe le début de la
 * fenêtre comptée — les précédentes sont derrière elle et ne libèrent plus rien ;
 * elles disent seulement combien on a déjà offert à ce compte sur la période,
 * qui est exactement ce qu'on veut savoir avant d'en offrir une de plus.
 *
 * Le panneau suit la GRAMMAIRE DES RÉGLAGES (`components/settings/settings-ui`,
 * MIN-167), comme l'onglet « Modèles ». Il ne l'a pas toujours fait, et ça se
 * voyait : six sections toutes en `text-sm font-semibold`, certaines bordées et
 * d'autres nues, chacune suivie de son paragraphe d'explication — rien ne disait
 * ce qui était un titre, un fait ou un geste. La même information tient
 * maintenant en trois cartes de rangées « libellé à gauche · valeur à droite »,
 * et la prose (ce qu'un compte interne cesse d'alimenter, ce qu'une remise à
 * zéro n'efface pas) est passée derrière les ⓘ, où on la lit quand on la
 * cherche. En haut, ce qui identifie le compte : l'avatar, le nom, l'email, puis
 * ses pastilles d'état sur leur propre ligne — accrochées au titre, elles le
 * tronquaient dès qu'un nom était long.
 *
 * Seul écran de l'app où l'email brut s'affiche : c'est l'identifiant avec
 * lequel un admin travaille, et l'accès est verrouillé côté serveur
 * (`app/(app)/admin/layout.tsx` + `isAdminUser` sur chaque route).
 */

const PAGE_SIZE = 25;
const NO_OVERRIDE = "none";
/** Valeur du sélecteur de durée qui n'envoie AUCUNE durée : l'échéance en place
 *  ne bouge pas. Proposée seulement quand un cadeau est déjà en cours — sinon
 *  « ne pas changer » ne changerait rien de rien. */
const KEEP_DURATION = "keep";

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
  const [duration, setDuration] = useState<string>(DEFAULT_GIFT_DURATION);
  const [note, setNote] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [busyQuota, setBusyQuota] = useState(false);
  const [savingInternal, setSavingInternal] = useState(false);
  /** Le registre des remises à zéro de la période — `null` tant qu'il charge. */
  const [resets, setResets] = useState<AdminQuotaReset[] | null>(null);

  // Le panneau se remplit à chaque ouverture (et à chaque compte suivant).
  useEffect(() => {
    setOverride(user?.billing.override ?? NO_OVERRIDE);
    setNote(user?.billing.overrideNote ?? "");
    // Cadeau déjà en cours → on ne touche pas à son échéance par défaut ;
    // sinon la durée courante, « 1 mois ».
    setDuration(user?.billing.override ? KEEP_DURATION : DEFAULT_GIFT_DURATION);
  }, [user?.userId, user?.billing.override, user?.billing.overrideNote]);

  // Le registre ne voyage pas avec la liste des comptes : il coûterait une
  // requête de plus par ligne pour une information qu'on ne lit qu'ici.
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
        // Le registre manquant ne doit pas condamner le reste du panneau : on
        // le montre vide, le geste « Remettre à zéro » reste offert.
        if (alive) setResets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!user) return null;

  /** Un instant : la date ET l'heure — « dernière connexion » se lit à l'heure. */
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

  /** Une échéance : la date seule. L'heure d'un cadeau qui finit dans trois mois
   *  n'apprend rien et allonge la ligne d'un tiers. */
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
          // Durée omise = l'échéance en place ne bouge pas (le serveur ne
          // relance pas le compte à rebours sur une simple correction de note).
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
   * Pose une remise à zéro de plus (`undoId` absent), ou en retire une.
   *
   * Le serveur renvoie l'état recalculé dans les deux cas : retirer une remise
   * à zéro ROUVRE la fenêtre sur des dépenses qui n'étaient plus comptées, et le
   * nouveau montant ne se devine pas d'ici. La dépense RÉELLE du mois, elle, ne
   * bouge jamais — c'est tout l'intérêt du filigrane.
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

  // L'onboarding tient en UNE ligne : où il en est, et l'étape en cours quand
  // elle veut dire quelque chose (un compte à qui l'onboarding n'a jamais été
  // montré n'a franchi aucune étape et n'en franchira pas).
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
          // L'étape vient de la base : clé assemblée à l'exécution.
          step: t(
            `users.step_${user.onboarding.currentStep}` as MessageKey<"Admin">,
          ),
        })
      : null;

  /** Ce que le bouton « Offrir » va poser : une durée ne dit pas d'elle-même à
   *  quelle date elle tombe. */
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
        {/* ── Qui c'est ─────────────────────────────────────────────────── */}
        {/* En-tête sur la surface de carte du panneau ; le corps, lui, passe en
            `bg-background` — la convention du shell (fond gris, cartes
            blanches), sans quoi des cartes `bg-card` sur un panneau `bg-card`
            ne se détacheraient de rien. */}
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
          {/* L'état du compte, en pastilles : le plan, ce qui le met à part, ce
              qui le bloque. Sous l'identité, jamais dans son titre — un badge
              collé au nom est ce qui le tronquait. */}
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
          {/* ── Le compte en chiffres ─────────────────────────────────── */}
          {/* Filets à 1 px par `gap-px` sur fond de bordure : les tuiles ne
              peuvent pas se toucher, et la valeur reste alignée d'une colonne à
              l'autre même quand un libellé passe à la ligne. */}
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

          {/* ── Le compte ─────────────────────────────────────────────── */}
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
              // La liste exhaustive de ce qui cesse de compter est vraie et
              // utile — mais c'est de la prose : elle vit derrière le ⓘ.
              help={t("users.internalSubtitle")}
              control={
                <>
                  {/* L'interrupteur reste en place pendant l'écriture : le
                      remplacer par le spinner ferait pointer le libellé sur un
                      `id` disparu, et sauter la ligne. */}
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
            // Combien on en a déjà offert sur cette période : c'est la question
            // qu'on se pose avant d'en offrir une de plus, donc elle est à
            // gauche du bouton qui le fait.
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
            {/* La dépense réelle du mois ne bouge JAMAIS d'une remise à zéro :
                c'est tout l'intérêt de la montrer à côté du compté. */}
            <SettingsRow
              label={t("quotas.realSpend")}
              hint={t("quotas.calls", { count: user.usage.calls })}
              control={<Value>{fmtCost(user.usage.spentMonthUsd)}</Value>}
            />
            {/* Le registre de la période. Rien à montrer tant qu'aucune remise à
                zéro n'a été posée : une rangée vide ferait du bruit pour dire
                qu'il ne s'est rien passé. */}
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
                      {/* La plus récente est la SEULE qui compte encore : les
                          autres sont derrière elle, elles ne libèrent plus
                          rien. Le dire évite de lire la pile comme un cumul. */}
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

          {/* ── Plan : offrir, pour un temps ou sans limite ───────────── */}
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
                    {/* « Ne pas changer » n'a de sens que sur un cadeau déjà en
                        cours — et c'est alors le choix par défaut. */}
                    {user.billing.override ? (
                      <SelectItem value={KEEP_DURATION}>
                        {t("billing.durationKeep")}
                      </SelectItem>
                    ) : null}
                    {GIFT_DURATIONS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {/* Clé assemblée depuis la liste des durées. */}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** La valeur d'une rangée : un fait, aligné à droite, jamais tronqué au milieu. */
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
