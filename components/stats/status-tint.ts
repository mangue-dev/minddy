import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Status tints, the colors of the board's status icons. Spelled out in full
 * for Tailwind, and paired with a label in every legend and tooltip.
 */
export const STATUS_TINT: Record<IssueStatus, { bg: string; fill: string }> = {
  triage: { bg: "bg-[#FA8028]", fill: "fill-[#FA8028]" },
  backlog: { bg: "bg-muted-foreground/35", fill: "fill-muted-foreground/35" },
  todo: { bg: "bg-muted-foreground/70", fill: "fill-muted-foreground/70" },
  in_progress: { bg: "bg-[#B0890B] dark:bg-[#FADB28]", fill: "fill-[#B0890B] dark:fill-[#FADB28]" },
  in_review: { bg: "bg-[#AA41FF]", fill: "fill-[#AA41FF]" },
  done: { bg: "bg-[#1DD82C]", fill: "fill-[#1DD82C]" },
  canceled: { bg: "bg-[#D62115]", fill: "fill-[#D62115]" },
  duplicate: { bg: "bg-[#8E8E93]", fill: "fill-[#8E8E93]" },
};
