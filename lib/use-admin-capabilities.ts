"use client";

import { useQuery } from "@tanstack/react-query";
import type { CapabilityId, CapabilityStatus } from "@/lib/capabilities";

/**
 * The instance capabilities, as the admin shell reads them to decide which
 * tabs and sections exist at all (MIN-416). Mirrors `/api/admin/capabilities`
 * — a pure env read, no probe, so it is cheap and safe to gate UI on.
 *
 * While loading every capability reports `configured: true`: a tab must not
 * flicker out during the first paint, and the server re-checks everything
 * that actually costs money or data anyway. Gating is a courtesy shown to
 * operators whose instance lacks the integration; it is not an access rule.
 */
export function useAdminCapabilities() {
  const { data } = useQuery({
    queryKey: ["admin-capabilities"],
    queryFn: async (): Promise<Partial<Record<CapabilityId, CapabilityStatus>>> => {
      const res = await fetch("/api/admin/capabilities");
      if (!res.ok) return {};
      const body = (await res.json()) as {
        capabilities?: Record<CapabilityId, CapabilityStatus>;
      };
      return body.capabilities ?? {};
    },
    staleTime: 5 * 60 * 1000,
  });

  /** `null` = not known yet → treat as available (see above). */
  const configured = (id: CapabilityId): boolean | null => {
    const status = data?.[id];
    return status ? status.configured : null;
  };
  return { configured };
}
