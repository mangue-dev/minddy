import { Suspense } from "react";
import { AuthLoading } from "@/components/auth/auth-chrome";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { SignupClosed } from "@/components/auth/signup-closed";
import { isPreviewEnv } from "@/lib/env";
import { resolveInvitationToken } from "@/lib/server/invitation-token";

/**
 * Registration is a separate journey since MIN-300: its own route, its
 * own screen, three steps. She was a tab of `/login` — a `?mode=`
 * qui changeait cinq champs de place.
 *
 * Like `/login`, the PAGE is a server component: the `?invite=<token>` of a
 * invitation email resolves to service key (MIN-197) — the guest has no
 * session, and would in any case not have access to the project whose display is displayed.
 * name. Token missing, unknown or expired → `null`, and the screen is the ordinary.
 *
 * Preview closes sign-ups in Supabase Auth (MIN-766): the page explains it
 * and links to the production sign-up instead of a form bound to fail.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isPreviewEnv()) return <SignupClosed />;

  const params = await searchParams;
  const raw = params.invite;
  const token = typeof raw === "string" ? raw : null;
  const invite = token ? await resolveInvitationToken(token) : null;

  return (
    <Suspense fallback={<AuthLoading />}>
      <SignupWizard invite={invite} />
    </Suspense>
  );
}
