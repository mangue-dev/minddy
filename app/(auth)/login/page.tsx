import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Spinner } from "mangue-ui";
import { LoginForm } from "@/components/auth/login-form";
import { resolveInvitationToken } from "@/lib/server/invitation-token";
import { preserveAuthParams } from "@/lib/signup-wizard";

/**
 * The login screen is a customer form (`components/auth/login-form`),
 * but the PAGE is a server component since MIN-197: the `?invite=<token>`
 * of an invitation email must be resolved in service key — the guest does not have
 * session, and would in any case not have access to the project whose display is displayed.
 * name. Token missing, unknown or expired → `null`, and the screen is the ordinary.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // `?mode=signup` has been the inscription for the entire life of this screen: the
  // old links (invitation emails already sent, bookmarks, the 308 that we
  // just removed from next.config) still carry it. It now leads to
  // route, keeping what must follow it (MIN-300).
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
