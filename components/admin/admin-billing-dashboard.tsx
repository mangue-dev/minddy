"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "mangue-ui";
import { BILLING_PLANS, type BillingPlanId } from "@/lib/billing-plans";

/**
 * `/admin` → onglet « Facturation » (MIN-72) : chercher un compte par email et
 * poser/retirer un override de plan (`admin_override_plan_id`) — prioritaire
 * sur Stripe à la résolution, sans toucher à l'état d'abonnement. Usage type :
 * offrir Pro à un testeur, dépanner un webhook raté.
 */

interface BillingState {
  userId: string;
  name: string;
  planId: BillingPlanId;
  source: "admin_override" | "stripe" | "default";
  stripePlanId: string | null;
  override: BillingPlanId | null;
  note: string | null;
}

const NO_OVERRIDE = "none";

export function AdminBillingDashboard() {
  const t = useTranslations("Admin");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<BillingState | null>(null);
  const [override, setOverride] = useState<string>(NO_OVERRIDE);
  const [note, setNote] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = async () => {
    if (!email.trim() || searching) return;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/billing?email=${encodeURIComponent(email.trim())}`
      );
      const data = (await response.json()) as BillingState & { error?: string };
      if (!response.ok) {
        throw new Error(
          response.status === 404 ? t("billing.notFound") : data.error
        );
      }
      setState(data);
      setOverride(data.override ?? NO_OVERRIDE);
      setNote(data.note ?? "");
    } catch (err) {
      setState(null);
      toast.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!state || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: state.userId,
          planId: override === NO_OVERRIDE ? null : override,
          note: note.trim() || null,
        }),
      });
      const data = (await response.json()) as BillingState & { error?: string };
      if (!response.ok) throw new Error(data.error);
      setState({ ...state, ...data });
      setOverride(data.override ?? NO_OVERRIDE);
      setNote(data.note ?? "");
      toast.success(t("billing.saved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-5 px-4 py-6 md:px-8">
      <div>
        <h2 className="text-sm font-semibold">{t("billing.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("billing.subtitle")}</p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("billing.searchPlaceholder")}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" disabled={searching} className="gap-1.5">
          {searching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          {t("billing.search")}
        </Button>
      </form>

      {state && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{state.name}</span>
            <Badge variant="secondary">
              {t("billing.effectivePlan", { plan: state.planId })}
            </Badge>
            <Badge variant="outline">{t(`billing.source_${state.source}`)}</Badge>
            {state.stripePlanId && state.source !== "stripe" && (
              <span className="text-xs text-muted-foreground">
                {t("billing.stripeUnderneath", { plan: state.stripePlanId })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
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
            <div className="min-w-56 flex-1 space-y-1.5">
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
            <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {t("billing.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
