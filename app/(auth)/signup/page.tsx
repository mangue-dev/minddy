import { Suspense } from "react";
import { Spinner } from "mangue-ui";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { resolveInvitationToken } from "@/lib/server/invitation-token";

/**
 * L'inscription est un parcours à part depuis MIN-300 : sa propre route, son
 * propre écran, trois étapes. Elle était un onglet de `/login` — un `?mode=`
 * qui changeait cinq champs de place.
 *
 * Comme `/login`, la PAGE est un server component : le `?invite=<token>` d'un
 * email d'invitation se résout en clé service (MIN-197) — l'invité n'a pas de
 * session, et n'aurait de toute façon pas accès au projet dont on affiche le
 * nom. Token absent, inconnu ou expiré → `null`, et l'écran est l'ordinaire.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.invite;
  const token = typeof raw === "string" ? raw : null;
  const invite = token ? await resolveInvitationToken(token) : null;

  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <SignupWizard invite={invite} />
    </Suspense>
  );
}
