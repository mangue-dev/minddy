"use client";

import { useQuery } from "@tanstack/react-query";

const ICON_CACHE_TIME_MS = 5 * 60_000;

export const projectIconQueryKey = (url: string) => ["project-icon", url] as const;

/** Public shares and legacy images retain their direct image delivery. */
export function isProtectedProjectIconUrl(url: string): boolean {
  return /^\/api\/projects\/[0-9a-f-]{36}\/icon\/content(?:\?|$)/i.test(url) &&
    !url.includes("share_token=");
}

/** Account-scoped image data stays in memory and follows the URL's version. */
export function useProjectIcon(url: string) {
  return useQuery({
    queryKey: projectIconQueryKey(url),
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { signal, credentials: "same-origin" });
      if (!response.ok) throw new Error("Unable to load project icon");
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Unable to read project icon"));
        reader.readAsDataURL(blob);
      });
    },
    staleTime: ICON_CACHE_TIME_MS,
    gcTime: ICON_CACHE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
