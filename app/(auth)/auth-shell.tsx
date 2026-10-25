"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopAuthBridge } from "@/components/desktop-auth-bridge";
import { DesktopLocalSignIn } from "@/components/auth/desktop-local-sign-in";
import { PreviewEnvBanner } from "@/components/preview-env-banner";

/**
 * The shell of the auth screens: a plain background, and nothing else (MIN-300).
 *
 * This background has a story, which is a lesson. It was the “grain” shader
 * gradient” of Paper on the left half of a two-column page; Then,
 * the column disappeared, CSS gradients tinted by intention; then the shader
 * again, in full page, then in high band, with a height MEASURED on
 * the top of the form so you never touch it.
 *
 * Each step corrected the defect of the previous one, and each added
 * a constraint: do not go under the text, do not overflow, recalculate
 * when the column grows. A setting that requires a `ResizeObserver` so as not to
 * hindering what we came to read is no longer a decoration. It is withdrawn.
 *
 * **Before submitting one**: this is a page where you type a password. THE
 * background must be able to remain stationary behind a vertically centered form
 * whose height changes at each step — without hiding it, and without having to
 * mesurer.
 *
 * The wide-screen showcase (MIN-781) honours this: it is a separate pane BESIDE
 * the column, never behind it, and the column keeps the plain background.
 */
/** Screens that carry their own full-height column (`AuthColumn`). */
const FULL_BLEED_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

export function AuthShell({
  children,
  showcase,
}: {
  children: React.ReactNode;
  /** The wide-screen pane beside the form (MIN-781), full-bleed screens only. */
  showcase: React.ReactNode;
}) {
  const pathname = usePathname();
  // Login, Registration and the two Forgotten Password screens (MIN-297)
  // place their column themselves: the mark at the top left of the WINDOW, the
  // content in the center. The OAuth (consent/success) screens are simple
  // centered maps.
  const fullBleed = FULL_BLEED_ROUTES.has(pathname);

  return (
    <AuthProvider>
      {/* Return of the system browser, in the desktop app (MIN-291). Born
 renders nothing outside the app, and nothing until a link arrives. */}
      <DesktopAuthBridge />
      {/* The desktop app's own local instance needs no sign-in (MIN-781). */}
      {(pathname === "/login" || pathname === "/signup") && <DesktopLocalSignIn />}
      {/* The window moving strip no longer lives here: it is in
 the root layout, therefore on ALL screens (MIN-292). These screens
 were just one of five that were missing. */}
      {/* A column, so the preview warning (MIN-766) takes its height from
 the screen below it instead of pushing it past the fold. */}
      <div className="auth-shell flex min-h-[100dvh] flex-col bg-background">
        <PreviewEnvBanner />
        {fullBleed ? (
          <div className="flex flex-1">
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
            {showcase}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            {children}
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
