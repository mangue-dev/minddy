"use client";

import { useQuery } from "@tanstack/react-query";
import { AiInstructionProposalCard } from "@/components/ai-instruction-proposal-card";
import { ProjectOrb } from "@/components/project-orb";
import { AI_INSTRUCTION_PROPOSALS_KEY, fetchAiInstructionProposalsApi } from "@/lib/ai-instructions-api";
import { orbSeedOr } from "@/lib/project-orb-colors";
import { useProjects } from "@/lib/projects-context";
import { useHiddenProjects } from "@/lib/use-hidden-projects";

/**
 * The instructions minddy proposes to the owner (MIN-988), on Home: one card
 * per project that has one waiting, named by its project. Nothing to answer,
 * nothing shown. Hidden projects stay out of Home, their proposals too; they
 * remain in the project's settings.
 */
export function HomeAiInstructionProposals() {
  const { data } = useQuery({
    queryKey: AI_INSTRUCTION_PROPOSALS_KEY,
    queryFn: ({ signal }) => fetchAiInstructionProposalsApi(signal).catch(() => []),
  });
  const { projects } = useProjects();
  const { hiddenProjectIds } = useHiddenProjects();
  const proposals = (data ?? []).filter((proposal) => !hiddenProjectIds.has(proposal.project_id));
  if (proposals.length === 0) return null;

  return (
    <>
      {proposals.map((proposal) => {
        const project = projects.find((p) => p.id === proposal.project_id);
        if (!project) return null;
        return (
          <AiInstructionProposalCard
            key={proposal.id}
            proposal={proposal}
            heading={
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ProjectOrb
                  seed={orbSeedOr(project.id, project.orb_seed)}
                  iconUrl={project.icon_url}
                  className="size-4 rounded-[5px]"
                />
                <span className="max-w-56 truncate">{project.name}</span>
              </p>
            }
          />
        );
      })}
    </>
  );
}
