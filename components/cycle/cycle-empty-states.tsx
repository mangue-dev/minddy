"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, toast } from "mangue-ui";
import { CheckCircle2, IterationCw, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { CYCLES_ENABLED_META_KEY } from "@/lib/cycle-prefs";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import type { CycleInfo } from "@/lib/types";

/**
 * The three empty states of the cycle view (MIN-32):
 *  (a) before activation — welcome copy + how-it-works bullets + the
 *      "Activate cycles" button (flips the metadata pref; the next board read
 *      lazily creates AND fills the first cycle);
 *  (b) a future cycle — "starts on {date}";
 *  (c) an active but empty cycle — plain notice + how to fill it.
 */

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 px-6 pt-4">
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <IterationCw className="size-6" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function CycleActivationWelcome() {
  const t = useTranslations("Cycles");
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [activating, setActivating] = useState(false);

  const activate = async () => {
    if (!user || activating) return;
    setActivating(true);
    try {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      await updateUser({ data: { ...meta, [CYCLES_ENABLED_META_KEY]: true } });
      // The next board read creates the first cycle and auto-fills it from the
      // issues assigned to me.
      await queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <EmptyShell>
      <p className="text-sm font-semibold">{t("welcomeTitle")}</p>
      <ul className="flex max-w-sm flex-col gap-1 text-sm text-muted-foreground">
        <li>{t("welcomeBullet1")}</li>
        <li>{t("welcomeBullet2")}</li>
        <li>{t("welcomeBullet3")}</li>
      </ul>
      <Button size="sm" className="mt-1" onClick={() => void activate()} disabled={activating || !user}>
        {activating ? <Loader2 className="animate-spin" /> : <IterationCw />}
        {t("activate")}
      </Button>
    </EmptyShell>
  );
}

export function CycleFutureNotice({ cycle }: { cycle: CycleInfo }) {
  const t = useTranslations("Cycles");
  const format = useFormatter();
  const start = format.dateTime(new Date(`${cycle.start_date}T00:00:00`), {
    day: "numeric",
    month: "long",
  });
  return (
    <EmptyShell>
      <p className="max-w-xs text-sm text-muted-foreground">
        {t("futureCycle", { date: start })}
      </p>
    </EmptyShell>
  );
}

export function CycleEmptyNotice() {
  const t = useTranslations("Cycles");
  return (
    <EmptyShell>
      <p className="text-sm text-muted-foreground">{t("emptyCycle")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t("emptyCycleHint")}</p>
    </EmptyShell>
  );
}

/**
 * Every issue of the current cycle is closed — the one moment where offering
 * a refill makes sense (the engine never refills mid-cycle on its own; the
 * person clicks, the engine picks). A slim banner above the board, not a
 * replacement: the finished cards stay visible below.
 */
export function CycleCompletedBanner() {
  const t = useTranslations("Cycles");
  const queryClient = useQueryClient();
  const [refilling, setRefilling] = useState(false);

  const refill = async () => {
    if (refilling) return;
    setRefilling(true);
    try {
      const response = await fetch("/api/me/cycle/fill", { method: "POST" });
      const data = (await response.json().catch(() => null)) as
        | { added?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error ?? "Request failed");
      const added = data?.added ?? 0;
      toast.success(
        added > 0 ? t("refillAdded", { count: added }) : t("refillEmpty")
      );
      await queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefilling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("completedTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("completedDesc")}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void refill()} disabled={refilling}>
        {refilling ? <Loader2 className="animate-spin" /> : <IterationCw />}
        {t("refill")}
      </Button>
    </div>
  );
}
