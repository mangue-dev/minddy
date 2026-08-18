"use client";

import { useQuery } from "@tanstack/react-query";

export interface MfaStatus {
  enabled: boolean;
  /** TOTP factors checked — 1 in practice. */
  verifiedFactors: number;
  /** Recovery codes still consumable. */
  unusedRecoveryCodes: number;
}

export const mfaStatusQueryKey = ["mfa-status"] as const;

/**
 * State of the second factor of the account (MIN-132).
 *
 * In a shared hook rather than in the local state of the section, because TWO
 * places depend on it: the section itself, and the settings page which sets
 * an attention badge on the “tab Security” as long as 2FA is
 * inactive. Without that, the recommendation would only be visible from the tab
 * which we don't think to open.
 */
export function useMfaStatusQuery() {
  const { data, isPending } = useQuery({
    queryKey: mfaStatusQueryKey,
    queryFn: async (): Promise<MfaStatus> => {
      const response = await fetch("/api/account/mfa");
      if (!response.ok) throw new Error("Failed to load MFA status");
      return (await response.json()) as MfaStatus;
    },
  });
  return { status: data ?? null, loading: isPending };
}
