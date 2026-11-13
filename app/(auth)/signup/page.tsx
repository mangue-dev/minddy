import { Suspense } from "react";
import { AuthLoading } from "@/components/auth/auth-chrome";
import { AuthEntry } from "@/components/auth/auth-entry";
import { resolveInvitationToken } from "@/lib/server/invitation-token";

/**
 * `/signup` shows the single sign-in and sign-up screen (MIN-907), like
 * `/login`: invitation emails, the desktop app and old links still open it.
 * The screen asks for the address and then knows whether to create the
 * account; on preview, where sign-ups are closed (MIN-766), it says so once
 * a new address is given.
 *
 * Like `/login`, the PAGE is a server component: the `?invite=<token>` of an
 * invitation email resolves with the service key (MIN-197).
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
    <Suspense fallback={<AuthLoading />}>
      <AuthEntry invite={invite} />
    </Suspense>
  );
}
