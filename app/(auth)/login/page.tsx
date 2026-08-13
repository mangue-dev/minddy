import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Spinner } from "mangue-ui";
import { LoginForm } from "@/components/auth/login-form";
import { resolveInvitationToken } from "@/lib/server/invitation-token";
import { preserveAuthParams } from "@/lib/signup-wizard";

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

  // `?mode=signup` a été l'inscription pendant toute la vie de cet écran : les
  // vieux liens (emails d'invitation déjà partis, marque-pages, la 308 qu'on
  // vient de retirer de next.config) le portent encore. Il mène maintenant au
  // parcours, en gardant ce qui doit le suivre (MIN-300).
  if (params.mode === "signup") {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") search.set(key, value);
    }
    redirect(`/signup${preserveAuthParams(search)}`);
  }

  const raw = params.invite;
  const token = typeof raw === "string" ? raw : null;
  const invite = token ? await resolveInvitationToken(token) : null;

  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <LoginForm invite={invite} />
    </Suspense>
  );
}
