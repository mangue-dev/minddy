"use server";

import { redirect } from "next/navigation";
import {
  unlockShareWithPassword,
  type ShareUnlockError,
} from "@/lib/server/share-unlock";

/** Clé du namespace PublicShare, rendue sous le formulaire. */
export type UnlockState = { error: ShareUnlockError } | null;

/**
 * Déverrouiller une page publiée protégée par mot de passe (MIN-283).
 *
 * Tout ce qui touche au secret est dans `lib/server/share-unlock.ts`, partagé
 * avec la vue partagée : il ne reste ici que le chemin de retour. Pas de
 * domaine personnalisé à ménager — une page publiée répond sur `/p/<token>` et
 * nulle part ailleurs (les domaines de MIN-36 mappent un board ou une vue).
 */
export async function unlockPageShare(
  token: string,
  _prev: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  const result = await unlockShareWithPassword({
    token,
    password: formData.get("password"),
    cookiePath: `/p/${token}`,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/p/${token}`);
}
