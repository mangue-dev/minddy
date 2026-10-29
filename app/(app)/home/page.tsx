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
    <section
      className={
        // `minmax(0,1fr)`: the implicit column is `auto`, which never shrinks
        // below its content's min-content width — a long model name in the
        // composer widened the whole column past a phone's screen.
        // Equal outer rows keep the greeting at the center of the page; the
        // last one grows past its share only when the banners and the
        // composer need more room than half the screen.
        "grid min-h-full grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto_1fr] px-6"
      }
    >
      <div aria-hidden />

      <div className={HERO_COLUMN}>
        <h1 className="w-full text-center font-display text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
      </div>

      <div className="flex flex-col">
        <div className={cn(HERO_COLUMN, "flex flex-col gap-3 pt-5")}>
          <PendingInvitationsBanner />
          <HomeSmartAssignWarning />
          <HomeProjectSignals />
          <DesktopInstallBanner />
          <MobileInstallHint key={user?.id} />
        </div>

        {/* Pinned at the foot like the panel's composer: sticky keeps it in
        view when the banners make the page scroll. */}
        <div className={cn(COMPOSER_COLUMN, "sticky bottom-0 mt-auto pb-4 pt-6")}>
          <HomeNumoComposer />
        </div>
      </div>
    </section>
  );
}
