"use client";

import { useTranslations } from "next-intl";
import { Button, Skeleton } from "mangue-ui";
import { Plus } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { usePlanGates } from "@/lib/use-billing-query";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { ProjectCard, NewProjectCard } from "@/components/project-card";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { HomeCycleCard } from "@/components/home/home-cycle-card";
import { HomeGlobalCard } from "@/components/home/home-global-card";
import { HomeFeedbackSection } from "@/components/home/home-feedback-section";

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

  const meta = user?.user_metadata as AuthMeta | undefined;
  const name = displayName(
    {
      full_name: meta?.display_name || meta?.full_name || meta?.name || null,
      email: user?.email ?? null,
    },
    t("greetingFallback"),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <PendingInvitationsBanner />

      {/* Greeting + a clearly-accessible "new ticket" button (MIN-38). */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("greeting", { name })}
        </h1>
        <Button onClick={() => openCreateIssue()} disabled={!canCreate}>
          <Plus className="size-4" />
          {t("newTicket")}
        </Button>
      </div>

      {/* "Ask Numo" composer — hands off to the global assistant panel. */}
      <HomeNumoComposer />

      {/* Focus: the current cycle + a global pulse. Stacked full-width until
          lg — two narrow columns cram the cycle card's rings on tablet/mobile.
          Explicit grid-cols give minmax(0,1fr) tracks so a card's content can't
          blow the column past the viewport. */}
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
    </div>
  );
}
