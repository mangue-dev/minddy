import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";
import { attachPendingInvitations } from "@/lib/server/members";
import { claimAvatarSeed } from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Ce qui se passe quand une session vient de naître, quel que soit le chemin
 * qui l'a ouverte.
 *
 * Ces trois gestes vivaient dans `app/auth/callback/route.ts`, seule porte
 * d'entrée à l'époque. Depuis MIN-345 il y en a deux — le callback pour le tour
 * OAuth, et `/auth/confirm/complete` pour le jeton d'un lien e-mail, qui n'est
 * plus consommé sur une navigation — et une session qui naît par la seconde
 * doit valoir exactement la même chose que par la première : mêmes événements,
 * mêmes invitations rattachées, même avatar. D'où ce module, et non une copie.
 */

export function buildAuthFailureRedirect(
  origin: string,
  reason: string,
  error = "auth_callback_failed"
): NextResponse {
  const url = new URL(`${origin}/login`);
  url.searchParams.set("error", error);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString());
}

/**
 * Inscription ou connexion ? (MIN-78)
 *
 * C'est ICI que la question se tranche, et nulle part ailleurs : le serveur voit
 * `created_at` et `last_sign_in_at` du compte au moment exact de l'échange.
 * Un écart de quelques secondes entre les deux = première connexion. AutoKap
 * avait tenté l'heuristique côté client (« compte créé il y a moins d'une
 * minute »), qui étiquetait mal les premières connexions différées et
 * double-comptait avec l'événement serveur — d'où ce choix.
 *
 * Ces événements partent quel que soit le consentement cookies : aucun cookie
 * n'est posé de ce fait, et le `distinctId` est l'id du compte, que
 * l'utilisateur nous confie déjà en créant ce compte.
 *
 * L'alerte push « nouvel utilisateur » (MIN-92), elle, ne part PLUS d'ici : ce
 * callback ne voit que les comptes dont quelqu'un a ouvert le lien, et une
 * inscription par email ne le traverse jamais avant. Elle part désormais du
 * webhook `auth.users` (MIN-117). Les événements PostHog restent, eux : ils
 * datent la première SESSION, pas la création du compte.
 */
export function onAuthArrival(
  user: User | null,
  channel: "oauth" | "email_confirmation" | "otp"
): void {
  if (!user) return;
  const provider = user.app_metadata?.provider ?? "email";
  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Number.NaN;
  // Première connexion : la session en cours est la toute première du compte.
  const isFirstSignIn =
    !Number.isNaN(createdAt) &&
    (Number.isNaN(lastSignIn) || Math.abs(lastSignIn - createdAt) < 10_000);

  identifyServerUser(user.id, { signup_method: provider });

  if (channel === "email_confirmation") {
    captureServerEvent({
      distinctId: user.id,
      event: "signup_email_confirmed",
      properties: { method: provider },
    });
  }

  captureServerEvent({
    distinctId: user.id,
    event: isFirstSignIn ? "user_signed_up" : "user_signed_in",
    properties: { method: provider, channel },
  });
}

/**
 * Les invitations laissées en attente sur cette adresse deviennent les siennes
 * (MIN-197). C'est le point de rattachement PRINCIPAL : celui où minddy tient un
 * email VÉRIFIÉ par Supabase — et c'est cet email, jamais le `?invite=` du lien,
 * qui décide de qui hérite de quoi. Le rattrapage des sessions qui ne passent
 * pas par ici vit dans `claimPendingInvitationsLate`.
 *
 * **Attendu avant la redirection**, et non différé comme le reste du travail de
 * fond. La séquence est serrée : on redirige vers /home, qui demande aussitôt
 * ses invitations — et cette lecture filtre sur `invited_user_id`, que seul ce
 * rattachement pose. Différé, il courait contre le premier chargement, et le
 * perdre donne le pire accueil possible : quelqu'un qui vient de s'inscrire pour
 * rejoindre une équipe atterrit sur « créez votre premier projet », sans un mot
 * du projet qui l'a fait venir.
 *
 * Le coût est une attente, pas une requête de plus : elle avait déjà lieu, elle
 * se paie juste avant la réponse. Les notifications push, elles, restent
 * différées — `attachPendingInvitations` les passe à `afterOrNow`.
 *
 * Best-effort : une panne ici ne doit pas coûter la session qu'on vient
 * d'établir. Le rattachement se rejouera au prochain passage.
 */
export async function claimInvitations(user: User | null): Promise<void> {
  if (!user) return;
  try {
    await attachPendingInvitations(user);
  } catch (err) {
    console.error("[auth/callback] claim invitations failed:", err);
  }
}

/**
 * L'avatar choisi pendant l'inscription devient celui du compte (MIN-300).
 *
 * Le wizard tire la marque dans le navigateur, avant qu'aucun compte n'existe :
 * elle voyage dans `user_metadata.avatar_seed` et se pose ICI, à la première
 * session. `claimAvatarSeed` n'écrase jamais une marque déjà en place, donc
 * repasser par ce chemin à chaque connexion ne défait pas un « Nouvel avatar »
 * fait depuis les réglages.
 *
 * Attendu, comme le rattachement des invitations et pour la même raison : /home
 * demande l'avatar dès son premier rendu, et une écriture différée courrait
 * contre cette lecture — la personne verrait une autre marque que celle qu'elle
 * vient de choisir, jusqu'au prochain rechargement.
 *
 * Best-effort : une panne ici ne doit pas coûter la session qu'on vient
 * d'établir.
 */
export async function claimAvatarChoice(user: User | null): Promise<void> {
  const seed = (user?.user_metadata as { avatar_seed?: unknown } | undefined)?.avatar_seed;
  if (!user || typeof seed !== "string") return;
  try {
    await claimAvatarSeed(getServiceClient(), user.id, seed);
  } catch (err) {
    console.error("[auth/callback] claim avatar seed failed:", err);
  }
}

/** Les trois gestes d'arrivée, dans l'ordre où ils doivent avoir lieu. */
export async function completeAuthArrival(
  user: User | null,
  channel: "oauth" | "email_confirmation" | "otp"
): Promise<void> {
  onAuthArrival(user, channel);
  await claimInvitations(user);
  await claimAvatarChoice(user);
}
