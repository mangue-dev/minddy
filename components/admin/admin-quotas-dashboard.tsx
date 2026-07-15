"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Input, Separator, Skeleton, Spinner, toast } from "mangue-ui";
import { RotateCcw, Undo2 } from "lucide-react";

/**
 * Dashboard admin des LIMITES d'usage de l'agent (`/admin` → onglet « Quotas »).
 * Lit/écrit `/api/admin/agent-quota` : plafond mensuel global + une ligne par
 * utilisateur ayant consommé l'agent ce mois-ci.
 *
 * Le point important de cet écran : « remettre à zéro » ne supprime AUCUN coût.
 * Chaque ligne montre donc DEUX montants — la dépense réelle du mois (analyses,
 * intacte) et ce que le plafond compte vraiment (depuis la remise à zéro). C'est ce
 * qui rend l'action lisible : on voit que le quota est libéré ET que la comptabilité
 * n'a pas bougé. La remise à zéro s'annule (le mois entier recompte).
 *
 * Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx` + l'API.
 */

interface QuotaUser {
  userId: string;
  name: string;
  spentMonth: number;
  spentCounted: number;
  calls: number;
  lastUsedAt: string;
  resetAt: string | null;
  blocked: boolean;
}

interface QuotaPayload {
  cap: number;
  capDefault: number;
  monthStart: string;
  users: QuotaUser[];
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AdminQuotasDashboard() {
  const t = useTranslations("Admin");
  const [data, setData] = useState<QuotaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState("");
  const [savingCap, setSavingCap] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agent-quota");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as QuotaPayload;
      setData(payload);
      setCapDraft(String(payload.cap));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async (user: QuotaUser) => {
    if (busy) return;
    setBusy(user.userId);
    try {
      const res = await fetch("/api/admin/agent-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t("quotas.resetToast", { name: user.name }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const undoReset = async (user: QuotaUser) => {
    if (busy) return;
    setBusy(user.userId);
    try {
      const res = await fetch(`/api/admin/agent-quota?userId=${user.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t("quotas.undoToast", { name: user.name }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveCap = async () => {
    const cap = Number(capDraft);
    if (!Number.isFinite(cap) || cap <= 0) {
      toast.error(t("quotas.capInvalid"));
      return;
    }
    setSavingCap(true);
    try {
      const res = await fetch("/api/admin/agent-quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cap }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("quotas.capSaved"));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingCap(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8">
        <p className="text-sm text-destructive">{error ?? "—"}</p>
      </div>
    );
  }

  const capDirty = capDraft.trim() !== String(data.cap);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8">
      {/* Plafond global */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("quotas.capTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("quotas.capDescription")}</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              value={capDraft}
              onChange={(e) => setCapDraft(e.target.value)}
              inputMode="decimal"
              className="w-32 pl-6"
              aria-label={t("quotas.capTitle")}
            />
          </div>
          <Button size="sm" onClick={() => void saveCap()} disabled={!capDirty || savingCap}>
            {savingCap ? <Spinner /> : null}
            {t("quotas.capSave")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("quotas.capDefaultHint", { value: `$${data.capDefault}` })}
          </span>
        </div>
      </section>

      <Separator />

      {/* Par utilisateur */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{t("quotas.usersTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("quotas.usersDescription")}</p>
        </div>

        {data.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("quotas.empty")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {data.users.map((u) => (
              <div key={u.userId} className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{u.name}</span>
                    {u.blocked ? (
                      <Badge variant="destructive" className="h-5 text-[10px]">
                        {t("quotas.blocked")}
                      </Badge>
                    ) : null}
                    {u.resetAt ? (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {t("quotas.resetOn", { at: fmtTime(u.resetAt) })}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("quotas.lastUsed", { at: fmtTime(u.lastUsedAt) })} ·{" "}
                    {t("quotas.calls", { count: u.calls })}
                  </span>
                </div>

                {/* Les deux montants côte à côte : ce que le plafond compte, et la
                    dépense réelle du mois que la remise à zéro NE touche pas. */}
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        u.blocked ? "text-destructive" : ""
                      }`}
                    >
                      {fmtCost(u.spentCounted)} / ${data.cap}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("quotas.counted")}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {fmtCost(u.spentMonth)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("quotas.realSpend")}
                    </span>
                  </div>

                  {u.resetAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void undoReset(u)}
                      disabled={busy === u.userId}
                    >
                      {busy === u.userId ? <Spinner /> : <Undo2 className="size-3.5" />}
                      {t("quotas.undo")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void reset(u)}
                      disabled={busy === u.userId}
                    >
                      {busy === u.userId ? <Spinner /> : <RotateCcw className="size-3.5" />}
                      {t("quotas.reset")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("quotas.footnote")}</p>
      </section>
    </div>
  );
}
