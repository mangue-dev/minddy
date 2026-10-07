"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeProjectSignals } from "@/components/home/home-project-signals";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";
import { MobileInstallHint } from "@/components/home/mobile-install-hint";
import { HomeTip } from "@/components/home/home-tip";

type AuthMeta = { display_name?: string; full_name?: string; name?: string };

// Keep the shared composer centered within the content pane.
const HERO_COLUMN = "mx-auto w-full max-w-xl";

const HEADER_OFFSET = "desktop:pb-[var(--app-content-header-height)]";

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
      className={cn(
        "grid min-h-full grid-rows-[1fr_auto_1fr] px-6",
        HEADER_OFFSET,
      )}
    >
      <div className={cn(HERO_COLUMN, "flex items-end pb-5 pt-10")}>
        <h1 className="w-full text-center font-display text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
      </div>

      <div className={HERO_COLUMN}>
        <HomeNumoComposer />
      </div>

      <div className={cn(HERO_COLUMN, "flex flex-col gap-3 pb-10 pt-3")}>
        <PendingInvitationsBanner />
        <HomeSmartAssignWarning />
        <HomeProjectSignals />
        <DesktopInstallBanner />
        <MobileInstallHint key={user?.id} />
      </div>

      <HomeTip />
    </section>
  );
}
