"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { AutoTextarea } from "@/components/auto-textarea";
import { SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AI_INSTRUCTION_MAX_LENGTH } from "@/lib/ai-instructions";
import type { AiInstructionProposal } from "@/lib/ai-instruction-proposals";
import {
  AI_INSTRUCTION_PROPOSALS_KEY,
  aiInstructionsKey,
  resolveAiInstructionProposalApi,
} from "@/lib/ai-instructions-api";

/**
 * An instruction minddy proposes after people repeatedly corrected what
 * Smart Fill or Smart Assign set (MIN-988). The card says what was noticed,
 * shows the instruction in a field the owner can edit, and writes nothing
 * until they add it. Dismissing sets it aside; the server keeps that use
 * case quiet for thirty days.
 */
export function AiInstructionProposalCard({
  proposal,
  heading,
}: {
  proposal: AiInstructionProposal;
  /** Shown above the title where the card needs to name its project (Home). */
  heading?: ReactNode;
}) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const [text, setText] = useState(proposal.instruction);
  const [pending, setPending] = useState<"accept" | "dismiss" | null>(null);
  const automation = proposal.use_case === "assign" ? "Smart Assign" : "Smart Fill";
  const fieldId = `ai-proposal-${proposal.id}`;

  const answer = async (action: "accept" | "dismiss") => {
    setPending(action);
    try {
      await resolveAiInstructionProposalApi(
        proposal.id,
        action === "accept" ? { action, instruction: text.trim() } : { action },
      );
      toast.success(
        action === "accept" ? t("aiProposalAccepted", { automation }) : t("aiProposalDismissed"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      // Answered here or in another tab: both lists read the server again.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: AI_INSTRUCTION_PROPOSALS_KEY }),
        queryClient.invalidateQueries({ queryKey: aiInstructionsKey(proposal.project_id) }),
      ]);
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm">
      {heading}
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 font-medium">
          <HugeiconsIcon
            icon={proposal.use_case === "assign" ? SMART_ASSIGN_ICON : SMART_FILL_ICON}
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {t("aiProposalTitle", { automation })}
        </p>
        <p className="leading-relaxed">{proposal.observation}</p>
      </div>
      <div className="flex flex-col gap-1">
        <AutoTextarea
          id={fieldId}
          aria-label={t("aiProposalFieldLabel")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={AI_INSTRUCTION_MAX_LENGTH}
          disabled={pending !== null}
          className="min-h-9 w-full rounded-lg bg-control px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-control-hover disabled:opacity-60"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("aiProposalHint", { count: proposal.correction_count })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending !== null || !text.trim()}
          onClick={() => void answer("accept")}
        >
          {pending === "accept" && <Spinner />}
          {t("aiProposalAccept")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void answer("dismiss")}
        >
          {pending === "dismiss" && <Spinner />}
          {t("aiProposalDismiss")}
        </Button>
      </div>
    </section>
  );
}
