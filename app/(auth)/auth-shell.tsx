"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopAuthBridge } from "@/components/desktop-auth-bridge";

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
 */
/** Screens that carry their own full-height column (`AuthColumn`). */
const FULL_BLEED_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

export function AuthShell({ children }: { children: React.ReactNode }) {
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
      {/* The window moving strip no longer lives here: it is in
 the root layout, therefore on ALL screens (MIN-292). These screens
 were just one of five that were missing. */}
      <div className="auth-shell min-h-[100dvh] bg-background">
        {fullBleed ? (
          children
        ) : (
          <div className="flex min-h-[100dvh] items-center justify-center p-6">
            {children}
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
