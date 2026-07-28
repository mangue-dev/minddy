"use client";

import { useTranslations } from "next-intl";
import { Button, Skeleton } from "mangue-ui";
import { Plus } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { usePlanGates } from "@/lib/use-billing-query";
import { useAuth } from "@/lib/auth-context";
import { useOnboarding } from "@/lib/use-onboarding";
import { displayName } from "@/lib/display-name";
import { ProjectCard, NewProjectCard } from "@/components/project-card";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { HomeCycleCard } from "@/components/home/home-cycle-card";
import { HomeGlobalCard } from "@/components/home/home-global-card";
import { HomeDueSoonSection } from "@/components/home/home-due-soon-section";
import { HomeTriageSection } from "@/components/home/home-triage-section";
import { OnboardingCard } from "@/components/home/onboarding-card";

// auto-fit + 1fr: empty trailing tracks collapse and the remaining cards share
// all the space, so the grid always spans the full row width (matching the
// dashboard's focus cards above) instead of leaving a gap on the right.
const GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
  gridAutoRows: "1fr",
} as const;

/** Display name from Supabase auth metadata (display_name → full_name → name),
    never the raw email — mirrors the sidebar account button. */
type AuthMeta = { display_name?: string; full_name?: string; name?: string };

export default function HomePage() {
  const t = useTranslations("Home");
  const { projects, loading, openCreateProject } = useProjects();
  const { openCreateIssue, canCreate } = useCreate();
  const { projectLimitReached } = usePlanGates();
  const { user } = useAuth();
  // Onboarding (MIN-74) : tant qu'il n'est pas terminé ni passé, il prend la
  // place du corps de la home — pour un compte neuf, cycle, board agrégé,
  // feedback et grille de projets n'ont rien à montrer.
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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <PendingInvitationsBanner />
      {/* Smart Assign actif mais sans règles : le tri silencieux ne trie rien.
          Ne rend rien quand tout est réglé — le cas courant. */}
      <HomeSmartAssignWarning />

      {/* Greeting + a clearly-accessible "new ticket" button (MIN-38). During
          onboarding the button is hidden: with no project it would only render
          disabled next to the step's own call to action — and the greeting
          welcomes rather than says hello, because it is a first visit. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {onboarding.showCard
              ? name
                ? t("welcome", { name })
                : t("welcomeNoName")
              : name
                ? t("greeting", { name })
                : t("greetingNoName")}
          </h1>
          {onboarding.showCard && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("onboardingSubtitle")}
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

          {/* Focus: the current cycle + a global pulse. Stacked full-width until
              lg — two narrow columns cram the cycle card's rings on
              tablet/mobile. Explicit grid-cols give minmax(0,1fr) tracks so a
              card's content can't blow the column past the viewport. */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HomeCycleCard />
            <HomeGlobalCard />
          </div>

          {/* À trier (MIN-104) — tickets en triage et retours non tranchés, le
              projet nommé sur chaque ligne. Remplace l'ancienne section Feedback,
              qui ne disait qu'un compte par projet. Rien à trier → rien du tout. */}
          <div className="mt-6">
            <HomeTriageSection />
          </div>

          {/* Projects grid — still the launcher. */}
          <h2 className="mb-4 mt-10 text-sm font-semibold tracking-tight text-muted-foreground">
            {t("yourProjects")}
          </h2>
          {loading ? (
            <div className="grid gap-4" style={GRID_STYLE}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[160px] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4" style={GRID_STYLE}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
              <NewProjectCard
                onClick={openCreateProject}
                disabled={projectLimitReached}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
