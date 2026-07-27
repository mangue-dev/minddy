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
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { HomeCycleCard } from "@/components/home/home-cycle-card";
import { HomeGlobalCard } from "@/components/home/home-global-card";
import { HomeDueSoonSection } from "@/components/home/home-due-soon-section";
import { HomeFeedbackSection } from "@/components/home/home-feedback-section";
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

      {/* Greeting + a clearly-accessible "new ticket" button (MIN-38). During
          onboarding the button is hidden: with no project it would only render
          disabled next to the step's own call to action. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {name ? t("greeting", { name }) : t("greetingNoName")}
        </h1>
        {!onboarding.visible && (
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
      ) : onboarding.visible ? (
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

          {/* Feedback — renders nothing when no project has open feedback. */}
          <div className="mt-6">
            <HomeFeedbackSection />
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
