"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planProgress, type PlanProgress } from "@/lib/plan";

/** Cache key for the personal scratchpad note. */
export const SCRATCHPAD_KEY = ["me", "scratchpad"] as const;

export interface ScratchpadResponse {
  content: string;
  updated_at: string | null;
  progress: PlanProgress;
}

const EMPTY: ScratchpadResponse = {
  content: "",
  updated_at: null,
  progress: { done: 0, total: 0 },
};

async function fetchScratchpad(): Promise<ScratchpadResponse> {
  const res = await fetch("/api/me/scratchpad");
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || text.trim() || "Request failed"
    );
  }
  return (data ?? EMPTY) as ScratchpadResponse;
}

async function putScratchpad(content: string): Promise<ScratchpadResponse> {
  const res = await fetch("/api/me/scratchpad", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || text.trim() || "Request failed"
    );
  }
  return data as ScratchpadResponse;
}

/** Reads the note. Gated by `enabled` so the app doesn't fetch until the notes
    modal is opened at least once. */
export function useScratchpadQuery(enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: SCRATCHPAD_KEY,
    queryFn: fetchScratchpad,
    enabled,
    staleTime: 10_000,
  });
  return {
    content: data?.content ?? "",
    updatedAt: data?.updated_at ?? null,
    progress: data?.progress ?? EMPTY.progress,
    isLoading,
  };
}

/** Saves the whole note. Optimistic so ticking a checkbox flips instantly and a
    debounced text edit feels immediate; the server response reconciles. */
export function useSaveScratchpad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => putScratchpad(content),
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: SCRATCHPAD_KEY });
      const prev = qc.getQueryData<ScratchpadResponse>(SCRATCHPAD_KEY);
      qc.setQueryData<ScratchpadResponse>(SCRATCHPAD_KEY, {
        content,
        updated_at: prev?.updated_at ?? null,
        progress: planProgress(content),
      });
      return { prev };
    },
    onError: (_err, _content, ctx) => {
      if (ctx?.prev) qc.setQueryData(SCRATCHPAD_KEY, ctx.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(SCRATCHPAD_KEY, data);
    },
  });
}
