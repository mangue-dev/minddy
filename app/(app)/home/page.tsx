"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { useZenMode } from "@/lib/zen-mode-context";
import { useOnboarding } from "@/lib/use-onboarding";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeProjectSignals } from "@/components/home/home-project-signals";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { OnboardingCard } from "@/components/home/onboarding-card";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";
import { HomeTip } from "@/components/home/home-tip";

/** Display name from Supabase auth metadata (display_name → full_name → name),
    never the raw email — mirrors the sidebar account button. */
type AuthMeta = { display_name?: string; full_name?: string; name?: string };

/** The column of the home block: much narrower than the page. Composing it is
    a sentence that we type, not a table — spread over the entire width of the content,
    he lost his center of gravity and salvation floated above nothing. */
const HERO_COLUMN = "mx-auto w-full max-w-xl";

/** Height of the shell header (`<Header/>` of mango-ui, `h-[60px]`). The area of
    contenu commence sous lui : ce qu'on y centre tombe 30 px trop bas par rapport
    at the WINDOW. A low gutter of this height raises the block exactly
    half — that's all that separates the two centers.

    Desktop only: below, the shell already reserves enough to clear the bar
    floating navigation (`--mobile-nav-clearance`, globals.css), and this
    reserve goes up the block more than the header had gone down. */
const HEADER_OFFSET = "desktop:pb-[60px]";

/**
 * The title of the welcome: “Hello” on the first visit, something else on
 * following. The pool depends on LOCAL time and day (lib/home-greeting.ts),
 * two things that server rendering doesn't know about — it's in UTC, and the draw
 * lot would in any case give two different sentences on both sides
 * hydration. The seed therefore only arises during editing: until then the title
 * remains the neutral “Hello”, which is also what the server rendered.
 *
 * A single seed for the entire life of the page: the sentence must not change
 * in front of you because the name has just arrived or a cache has been refreshed.
 */
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
  const t = useTranslations("Home");
  const { user } = useAuth();
  // Zen mode (MIN-134): without a header, the content area IS the window — the
  // gap that separates them no longer exists.
  const { zen } = useZenMode();
  // Onboarding (MIN-74): as long as it is not completed or passed, it takes
  // place of the reception block — a new account does not have to ask anything from Numo before
  // to have a project.
  const onboarding = useOnboarding();

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

  /**
   * The page fits on ONE screen, and nothing below. There was a column of
   * queues — pending, deadlines, to sort, the cycle, the notebook: a table of
   * edge below the waterline, which reiterated what the sidebar, the board
   * global and the notebook already show in full, each at home. The reception does not
   * therefore keep that what we come to seek there: to whom we speak (salvation), by
   * where we speak to him (compose him), and what awaits a response from me alone (a
   * invitation, l'avis de Smart Assign).
   */
  return onboarding.showCard ? (
    /**
     * Onboarding is centered in the CONTENT AREA: it is a map
     * to read from top to bottom, not a prompt to type, and so it keeps the
     * offset of the header rather than going up thirty pixels. Salvation
     * welcome instead of saying hello (it's a first visit), stay at
     * left edge like the map, and the compositing keeps the width of the
     * column — narrowness is the gesture of the reception block, not this one.
     */
    <section className="flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {name ? t("welcome", { name }) : t("welcomeNoName")}
        </h1>
        {/* The number of steps comes from the state, not from the translation: it was
            written in full (“Four Steps”) and denied
            the “Step 4 of 5” indicator on the map just below as soon as
            that a step was added (MIN-149). */}
        <p className="mt-1 text-sm text-muted-foreground">
          {t("onboardingSubtitle", { n: onboarding.totalCount })}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <HomeNumoComposer />
          <PendingInvitationsBanner />
          <HomeSmartAssignWarning />
        </div>

        <div className="mt-6">
          <OnboardingCard onboarding={onboarding} />
        </div>
      </div>
    </section>
  ) : (
    /**
     * The reception block outside of onboarding: greeting, composing it, then what
     * waits for a response (the invitations, the Smart Assign notice). Three
     * rows `1fr / auto / 1fr` — the two extremes share space
     * free in equal parts, which places the COMPOSER in the exact center, and not the
     * entire block: he is the one we are looking for, the greeting is written above.
     *
     * `min-h-full` and not `100dvh`: the reference height is that of the
     * <main> of the shell, which is not the entire window neither under the header nor on
     * ultrawide where the application becomes a bounded map.
     */
    <section
      className={cn(
        "grid min-h-full grid-rows-[1fr_auto_1fr] px-6",
        !zen && HEADER_OFFSET,
      )}
    >
      <div className={cn(HERO_COLUMN, "flex items-end pb-5 pt-10")}>
        <h1 className="w-full text-center font-display text-2xl font-semibold tracking-tight">
          {greeting}
        </h1>
      </div>

      {/* "Ask Numo" composer — hands off to the global assistant panel. */}
      <div className={HERO_COLUMN}>
        <HomeNumoComposer />
      </div>

      {/* Under the entry, and not at the head of the page: an invitation to a project
          is an answer to give, not a blindfold to be pushed away from the gaze in order to
          achieve salvation. Same place for the Smart Assign opinion — and the
          keeping in the block, rather than above it, is also what leaves the
          compose in the center of the window whatever they are wearing.

          The order is that of urgency: someone waiting for me, then a
          setting that sorts poorly, then what piled up in my projects. These
          last lines are there almost all the time, the first two
          almost never — putting them last is leaving room for
          above what, when it appears, is worth reading first. */}
      <div className={cn(HERO_COLUMN, "flex flex-col gap-3 pb-10 pt-3")}>
        <PendingInvitationsBanner />
        <HomeSmartAssignWarning />
        {/* Nothing during onboarding: this branch is not displayed while
            the card is there, and that's all it takes — a growing account
            your first project does not have to be told what to sort
            dedans. */}
        <HomeProjectSignals />
        {/* LAST, and for the same reason of urgency as the order above:
            this is the only line in the block that expects no response. She is
            also the only one to appear only once in the life of the account — and
            it does not appear at all during onboarding, this branch does not
            displayed only after (MIN-292). */}
        <DesktopInstallBanner />
        {/* AT THE ENTIRE BOTTOM, stuck at the foot of the page: the tip of the day. She
            does not belong to the line above — nothing awaits it, nothing is there
            answers, and that's precisely why she can stay there all the time
            days without weighing. She learns a gesture from the app to someone who has nothing
            request ; the only honest place for that is the one we don't look at
            only after reading the rest. */}
        <HomeTip />
      </div>
    </section>
  );
}
