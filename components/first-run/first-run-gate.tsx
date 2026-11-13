"use client";

import { useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import {
  FIRST_RUN_PENDING_ATTRIBUTE,
  PROFILE_SETUP_SINCE,
  firstRunPendingFromCookies,
  isFirstRunAccount,
  needsProfileSetup,
} from "@/lib/first-run";
import { useOnboardingChecklist } from "@/lib/use-onboarding";

/**
 * The blank page the first-run screens stand on while their code or their
 * data loads: from the profile to the tour, the app never shows in between
 * (MIN-907).
 */
function FirstRunBlank() {
  return <div aria-hidden className="fixed inset-0 z-[45] bg-background" />;
}

const ProfileSetupScreen = dynamic(
  () => import("@/components/first-run/profile-setup-screen").then((m) => m.ProfileSetupScreen),
  { ssr: false, loading: FirstRunBlank },
);
const OnboardingScreen = dynamic(
  () => import("@/components/first-run/onboarding-screen").then((m) => m.OnboardingScreen),
  { ssr: false, loading: FirstRunBlank },
);

/**
 * What a new account sees before the app (MIN-907): its profile, then the
 * getting-started tour, full screen on every platform (MIN-964). Accounts
 * older than these screens see neither.
 */
export function FirstRunGate() {
  const { user, loading } = useAuth();
  const onboarding = useOnboardingChecklist();
  const screen = firstRunScreen(user, onboarding);

  // The app must not show for a moment before a first-run screen (MIN-964).
  // Until the session is known, the cover (`<html data-first-run-pending>`,
  // app/globals.css) stays when the session cookie belongs to a new account:
  // the inline script set it for a page load, and this sets it, before paint,
  // on a client navigation from sign-in. Once decided, it lifts in the same
  // commit that mounts the screen, if any: that screen covers the app itself.
  const undecided = !user && loading;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!undecided) root.removeAttribute(FIRST_RUN_PENDING_ATTRIBUTE);
    else if (firstRunPendingFromCookies(document.cookie, PROFILE_SETUP_SINCE)) root.setAttribute(FIRST_RUN_PENDING_ATTRIBUTE, "");
  }, [undecided]);

  if (screen === "profile") return <ProfileSetupScreen />;
  if (screen === "blank") return <FirstRunBlank />;
  return screen === "tour" ? <OnboardingScreen /> : null;
}

function firstRunScreen(
  user: ReturnType<typeof useAuth>["user"],
  onboarding: ReturnType<typeof useOnboardingChecklist>,
): "profile" | "blank" | "tour" | null {
  if (needsProfileSetup(user)) return "profile";
  if (!isFirstRunAccount(user) || onboarding.dismissed) return null;
  // The tour's state is still loading for an account that has not left it.
  if (onboarding.loading) return "blank";
  return onboarding.showChecklist ? "tour" : null;
}
