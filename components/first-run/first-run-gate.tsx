"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { isFirstRunAccount, needsProfileSetup } from "@/lib/first-run";
import { useOnboardingChecklist } from "@/lib/use-onboarding";
import { useMobileLayout } from "@/lib/use-mobile-layout";

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
const MobileOnboardingScreen = dynamic(
  () => import("@/components/first-run/mobile-onboarding-screen").then((m) => m.MobileOnboardingScreen),
  { ssr: false, loading: FirstRunBlank },
);

/**
 * What a new account sees before the app (MIN-907): its profile, on every
 * platform, then on a phone the getting-started tour. Desktop keeps the
 * sidebar's checklist instead. Accounts older than these screens see neither.
 */
export function FirstRunGate() {
  const { user } = useAuth();
  const onboarding = useOnboardingChecklist();
  const mobile = useMobileLayout() === true;
  if (needsProfileSetup(user)) return <ProfileSetupScreen />;
  if (!mobile || !isFirstRunAccount(user) || onboarding.dismissed) return null;
  // The tour's state is still loading for an account that has not left it.
  if (onboarding.loading) return <FirstRunBlank />;
  return onboarding.showChecklist ? <MobileOnboardingScreen /> : null;
}
