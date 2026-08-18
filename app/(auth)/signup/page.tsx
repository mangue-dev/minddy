import { Suspense } from "react";
import { Spinner } from "mangue-ui";
import { SignupWizard } from "@/components/auth/signup-wizard";
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
