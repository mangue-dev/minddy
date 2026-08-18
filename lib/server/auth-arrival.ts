import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { captureServerEvent, identifyServerUser } from "@/lib/server/posthog";
import { attachPendingInvitations } from "@/lib/server/members";
import { claimAvatarSeed } from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * What happens when a session is just born, regardless of the path
 * that opened it.
 *
 * These three gestures lived in `app/auth/callback/route.ts`, the only entry point
 * at the time. Since MIN-345 there are two - the callback for the
 * OAuth tour, and `/auth/confirm/complete` for the token of an e-mail link, which is no longer consumed on a navigation - and a session which is born by the second
 * must be worth exactly the same thing as by the first: same events,
 * same invitations attached, same avatar. Hence this module, and not a copy.
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
 * Registration or login? (MIN-78)
 *
 * This is where the question is decided, and nowhere else: the server sees
 * `created_at` and `last_sign_in_at` of the account at the exact moment of the exchange.
 * A gap of a few seconds between the two = first connection. AutoKap
 * had tried the client-side heuristic ("account created less than 1
 * minute ago"), which mislabeled the first deferred connections and
 * double-counted with the server event — hence this choice.
 *
 * These events go regardless of the cookie consent: no cookie
 * is placed as a result, and the `distinctId` is the account ID, which
 * the user already gives us when creating this account.
 *
 * The “new user” push alert (MIN-92) no longer leaves here: this
 * callback only sees accounts that someone has linked to, and an email signup never passes through it before. It now starts from
 * webhook `auth.users` (MIN-117). The PostHog events remain: they
 * date from the first SESSION, not the creation of the account.
 */
export function onAuthArrival(
  user: User | null,
  channel: "oauth" | "email_confirmation" | "otp"
): void {
  if (!user) return;
  const provider = user.app_metadata?.provider ?? "email";
  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Number.NaN;
  // First connection: the current session is the very first for the account.
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
 * Invitations left pending on this address become theirs
 * (MIN-197). This is the MAIN connection point: the one where minddy holds a
 * email VERIFIED by Supabase — and it is this email, never the `?invite=` of the link,
 * that decides who inherits what. Catch-up for sessions that don't pass
 * through here lives in `claimPendingInvitationsLate`.
 *
 * **Expected before redirecting**, and not deferred like the rest of the work in
 * background. The sequence is tight: we redirect to /home, which immediately requests
 * its invitations — and this reading filters on `invited_user_id`, which only this
 * connection poses. Delayed, he was racing against the first load, and the
 * losing gives the worst reception possible: someone who has just signed up to
 * join a team lands on "create your first project", without a word
 * of the project that brought him in.
 *
 * The cost is a wait, not one more request: it already took place, it
 * is paid just before the response. Push notifications remain
 * deferred — `attachPendingInvitations` passes them to `afterOrNow`.
 *
 * Best-effort: a failure here should not cost the session that we have just
 * established. The attachment will be replayed on the next pass.
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
 * The avatar chosen during registration becomes that of the account (MIN-300).
 *
 * The wizard draws the mark in the browser, before no account exists:
 * it travels in `user_metadata.avatar_seed` and lands HERE, at the first
 *session. `claimAvatarSeed` never overwrites a mark already in place, so
 * going back through this path at each connection does not undo a “New avatar”
 * made from the settings.
 *
 * Expected, like the attachment of invitations and for the same reason: /home
 * asks for the avatar as soon as it is first rendered, and a delayed write would run
 * against this reading — the person would see a different mark than the one they
 * just chose, until the next reload.
 *
 * Best-effort: a failure here should not cost the session that we just
 * established.
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

/** The three arrival gestures, in the order in which they must take place. */
export async function completeAuthArrival(
  user: User | null,
  channel: "oauth" | "email_confirmation" | "otp"
): Promise<void> {
  onAuthArrival(user, channel);
  await claimInvitations(user);
  await claimAvatarChoice(user);
}
