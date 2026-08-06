import { Suspense } from "react";
import { Spinner } from "mangue-ui";
import { LoginForm } from "@/components/auth/login-form";
import { resolveInvitationToken } from "@/lib/server/invitation-token";

/**
 * L'écran de connexion est un formulaire client (`components/auth/login-form`),
 * mais la PAGE est un server component depuis MIN-197 : le `?invite=<token>`
 * d'un email d'invitation doit être résolu en clé service — l'invité n'a pas de
 * session, et n'aurait de toute façon pas accès au projet dont on affiche le
 * nom. Token absent, inconnu ou expiré → `null`, et l'écran est l'ordinaire.
 */
export default async function LoginPage({
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
      <LoginForm invite={invite} />
    </Suspense>
  );
}
