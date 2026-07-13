import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/server/admin";

// The admin dashboard must never be indexed, whatever the deploy environment.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Server gate for `/admin`. The middleware (`proxy.ts`) already bounces logged-out
 * visitors to /login; here we additionally require the session to be a minddy
 * admin, redirecting everyone else back home. We verify the JWT locally via
 * getClaims() (no GoTrue round-trip) — same path as `getAuthedUser`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    redirect("/login");
  }

  const user = {
    email: typeof claims.email === "string" ? claims.email : undefined,
    app_metadata: claims.app_metadata ?? {},
  } as Pick<User, "email" | "app_metadata">;

  if (!isAdminUser(user)) {
    redirect("/home");
  }

  return <>{children}</>;
}
