"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BriefPreview } from "@/components/project-seed/brief-preview";
import { useSeedProposal } from "@/lib/use-seed-proposal";
import type { SeedProposal } from "@/lib/seed/types";

/**
 * The starter proposal, in Numo's thread (MIN-173).
 *
 * Numo does not write twenty tickets one by one: he calls the brief pass
 * (`propose_backlog`) with what the conversation has established, and returns the hand.
 * What comes back is a PROPOSAL — the same objectives, the same tickets,
 * the same overview as the board modal (`components/project-seed/`), at the
 * panel width. Nothing exists until the button is clicked.
 *
 * The card only LIVES on the last proposition of the thread (`live`): once
 * the tickets created, the conversation resumes and the tool line is enough to say
 * what happened.
 */
export function SeedProposalCard({
  projectId,
  proposal,
  onCreated,
}: {
  /** The intended project, as the tool result describes it — the scope of the panel
   * may have moved since (navigation), the proposition has not. */
  projectId: string;
  proposal: SeedProposal;
  /** The tickets are written: the account leaves to tell Numo what exists. */
  onCreated: (created: number) => void;
}) {
  const t = useTranslations("Seed");
  const seed = useSeedProposal(projectId);
  const { setProposal } = seed;
  // Written once, the map freezes in place: it disappears when rendered
  // next (the thread starts again), and by then the button should no longer be able to do anything
  // write — a second click would create the batch twice.
  const [done, setDone] = useState(false);

  // The proposal comes from the tool result; the preview keeps its copy
  // alive (unchecked, rewritten titles) during rereading.
  useEffect(() => {
    setProposal(proposal);
  }, [proposal, setProposal]);

  if (!seed.proposal) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
      <p className="mb-2 text-xs text-muted-foreground">{t("previewDesc")}</p>
      <BriefPreview
        proposal={seed.proposal}
        excluded={seed.excluded}
        onToggle={seed.toggle}
        onRename={seed.rename}
        creating={seed.creating || done}
        onCreate={() => {
          void seed.create().then((result) => {
            if (!result) return;
            setDone(true);
            onCreated(result.created);
          });
        }}
        // The thread is already scrolling: the preview takes no more than half of the
        // height of the panel, and scrolls its list in it.
        className="max-h-[50vh]"
      />
    </div>
  );
}
