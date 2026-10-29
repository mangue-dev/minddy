"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeProjectSignals } from "@/components/home/home-project-signals";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";
import { MobileInstallHint } from "@/components/home/mobile-install-hint";

type AuthMeta = { display_name?: string; full_name?: string; name?: string };

// The greeting and the banners read as one centered column.
const HERO_COLUMN = "mx-auto w-full max-w-xl";

// The composer and its suggestions take the expanded Numo panel's column, so
// the home page and the panel opened from it start from the same layout.
const COMPOSER_COLUMN = "mx-auto w-full max-w-3xl";

// Resolve local time after hydration and keep the greeting stable for this visit.
function useGreeting(name: string): string {
  const t = useTranslations("Home");
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  if (seed === null) return name ? t("greeting", { name }) : t("greetingNoName");
  const variant = pickGreeting(new Date(), seed);
  return t(name ? variant.key : variant.keyNoName, { name });
}

export default function HomePage() {
  const { user } = useAuth();
  const meta = user?.user_metadata as AuthMeta | undefined;
  // Empty fallback: without name or e-mail, we greet without first name rather than injecting
  // a filler word in the sentence.
  const name = displayName(
    {
      full_name: meta?.display_name || meta?.full_name || meta?.name || null,
      email: user?.email ?? null,
    },
    "",
  );

  const greeting = useGreeting(name);

  return (
    // The greeting and the banners sit centered in the space the composer
    // leaves; the composer and its suggestions stay at the foot. When the
    // banners need more room than that, the page grows and scrolls as one
    // column: nothing is pinned over the banners.
    <section className="flex min-h-full flex-col px-6">
      <div className="flex-1" aria-hidden />

      {/* `min-w-0`: a long model name in the composer must not widen the
      column past a phone's screen. */}
      <div className={cn(HERO_COLUMN, "flex min-w-0 flex-col gap-3 pt-10")}>
        <h1 className="mb-2 w-full text-center font-display text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
        <PendingInvitationsBanner />
        <HomeSmartAssignWarning />
        <HomeProjectSignals />
        <DesktopInstallBanner />
        <MobileInstallHint key={user?.id} />
      </div>

      <div className="flex-1" aria-hidden />

      <div className={cn(COMPOSER_COLUMN, "min-w-0 pb-4 pt-8")}>
        <HomeNumoComposer />
      </div>
    </section>
  );
}
