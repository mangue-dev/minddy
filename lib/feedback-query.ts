import type { TeamFeedbackListItem } from "./server/feedback/team-queries";

/** The team view and tab preparation consume the same authorized query. */
export function feedbackQueryOptions(projectId: string) {
  return {
    queryKey: ["feedback", projectId] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await fetch(`/api/projects/${projectId}/feedback`, { signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to load feedback");
      return data as { posts: TeamFeedbackListItem[]; board_enabled: boolean };
    },
  };
}
