"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "mangue-ui";
import { Plus } from "lucide-react";
import { useCreate } from "@/lib/create-context";
import { useAuth } from "@/lib/auth-context";
import { useOnboarding } from "@/lib/use-onboarding";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { HomeCycleCard } from "@/components/home/home-cycle-card";
import { HomeWaitingCard } from "@/components/home/home-waiting-card";
import { HomeDueSoonSection } from "@/components/home/home-due-soon-section";
import { HomeScratchpadSection } from "@/components/home/home-scratchpad-section";
import { HomeTriageSection } from "@/components/home/home-triage-section";
import { OnboardingCard } from "@/components/home/onboarding-card";

/** Display name from Supabase auth metadata (display_name → full_name → name),
    never the raw email — mirrors the sidebar account button. */
type AuthMeta = { display_name?: string; full_name?: string; name?: string };

/**
 * Le titre de l'accueil : « Bonjour » à la première visite, autre chose aux
 * suivantes. Le vivier dépend de l'heure LOCALE et du jour (lib/home-greeting.ts),
 * deux choses que le rendu serveur ne connaît pas — il est en UTC, et le tirage
 * au sort donnerait de toute façon deux phrases différentes de part et d'autre
 * de l'hydratation. La graine ne se pose donc qu'au montage : jusque-là le titre
 * reste le « Bonjour » neutre, qui est aussi ce que le serveur a rendu.
 *
 * Une seule graine pour toute la vie de la page : la phrase ne doit pas changer
 * sous les yeux parce que le nom vient d'arriver ou qu'un cache s'est rafraîchi.
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
  const { openCreateIssue, canCreate } = useCreate();
  const { user } = useAuth();
  // Onboarding (MIN-74) : tant qu'il n'est pas terminé ni passé, il prend la
  // place du corps de la home — pour un compte neuf, cycle, échéances, carnet et
  // file de triage n'ont rien à montrer.
  const onboarding = useOnboarding();

  const meta = user?.user_metadata as AuthMeta | undefined;
  // Repli vide : sans nom ni e-mail, on salue sans prénom plutôt que d'injecter
  // un mot bouche-trou dans la phrase.
  const name = displayName(
    {
      full_name: meta?.display_name || meta?.full_name || meta?.name || null,
      email: user?.email ?? null,
    },
    "",
  );

  const greeting = useGreeting(name);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <PendingInvitationsBanner />
      {/* Smart Assign actif mais sans règles : le tri silencieux ne trie rien.
          Ne rend rien quand tout est réglé — le cas courant. */}
      <HomeSmartAssignWarning />

      {/* Greeting + a clearly-accessible "new ticket" button (MIN-38). During
          onboarding the button is hidden: with no project it would only render
          disabled next to the step's own call to action — and the greeting
          welcomes rather than says hello, because it is a first visit. A first
          visit gets no wisecrack either: the offbeat pool waits for the second. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {onboarding.showCard
              ? name
                ? t("welcome", { name })
                : t("welcomeNoName")
              : greeting}
          </h1>
          {/* Le nombre d'étapes vient de l'état, pas de la traduction : il était
              écrit en toutes lettres (« Quatre étapes ») et démentait
              l'indicateur « Étape 4 sur 5 » de la carte juste en dessous dès
              qu'une étape s'ajoutait (MIN-149). */}
          {onboarding.showCard && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("onboardingSubtitle", { n: onboarding.totalCount })}
            </p>
          )}
        </div>
        {!onboarding.showCard && (
          <Button onClick={() => openCreateIssue()} disabled={!canCreate}>
            <Plus className="size-4" />
            {t("newTicket")}
          </Button>
        )}
      </div>

      {/* "Ask Numo" composer — hands off to the global assistant panel. */}
      <HomeNumoComposer />

      {/* Nothing below the composer until the signals are in: `visible` would
          default to true (0 project, 0 issue) and flash the onboarding on a
          long-standing account's home. */}
      {onboarding.loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[200px] rounded-xl" />
          <Skeleton className="h-[200px] rounded-xl" />
        </div>
      ) : onboarding.showCard ? (
        <div className="mt-6">
          <OnboardingCard onboarding={onboarding} />
        </div>
      ) : (
        <>
          {/* Échéances proches (MIN-96) — tout en haut du corps, juste sous le
              composer : c'est du temps qui court, et c'est la seule chose de
              cette page qui périme. Ne rend rien quand aucun ticket n'entre dans
              la fenêtre de son effort — le cas courant, d'où l'absence de
              squelette (le corps attend déjà /api/me/summary via useOnboarding,
              donc rien n'apparaît après coup). */}
          <div className="mt-6">
            <HomeDueSoonSection />
          </div>

          {/* Focus: le cycle en cours + ce qui est arrêté en attendant une
              décision de ma part. Stacked full-width until lg — two narrow
              columns cram the cycle card's rings on tablet/mobile. Explicit
              grid-cols give minmax(0,1fr) tracks so a card's content can't blow
              the column past the viewport. */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HomeCycleCard />
            <HomeWaitingCard />
          </div>

          {/* Le carnet de tâches, en clair : personnel et cross-projet comme
              cette page. Carnet vide → rien du tout. */}
          <div className="mt-6">
            <HomeScratchpadSection />
          </div>

          {/* À trier (MIN-104) — tickets en triage et retours non tranchés, le
              projet nommé sur chaque ligne. Remplace l'ancienne section Feedback,
              qui ne disait qu'un compte par projet. Rien à trier → rien du tout. */}
          <div className="mt-6">
            <HomeTriageSection />
          </div>

          {/* Plus de grille de projets ici : la sidebar les liste tous, en
              permanence et sur toutes les pages, « Nouveau projet » compris. La
              même chose une deuxième fois, deux écrans plus bas, poussait le
              travail du jour hors de vue pour un lanceur qu'on n'utilisait pas. */}
        </>
      )}
    </div>
  );
}
