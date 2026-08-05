"use client";

import { useQuery } from "@tanstack/react-query";

export interface MfaStatus {
  enabled: boolean;
  /** Facteurs TOTP vérifiés — 1 en pratique. */
  verifiedFactors: number;
  /** Codes de récupération encore consommables. */
  unusedRecoveryCodes: number;
}

export const mfaStatusQueryKey = ["mfa-status"] as const;

/**
 * État du second facteur du compte (MIN-132).
 *
 * Dans un hook partagé plutôt qu'en état local de la section, parce que DEUX
 * endroits en dépendent : la section elle-même, et la page de réglages qui pose
 * une pastille d'attention sur l'onglet « Sécurité » tant que la 2FA est
 * inactive. Sans ça, la recommandation ne serait visible que depuis l'onglet
 * qu'on ne pense pas à ouvrir.
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
