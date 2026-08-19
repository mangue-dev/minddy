"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Spinner, cn } from "mangue-ui";
import { Check, Mail } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { MinddyLogo } from "@/components/minddy-logo";
import { IsoIcon } from "@/components/illustrations/iso-icon";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/password-policy";
import { getDesktopBridge, isDesktop } from "@/lib/desktop/bridge";

/**
 * What login and registration have in common (MIN-300).
 *
 * The two screens diverged the day registration became a course
 * apart (`/signup`) and the connection a simple centered card (`/login`). This
 * that they share is what does not depend on either of them: the brand, the
 * provider buttons, legal notices, and knowing if you are
 * in the desktop app window. The rest is up to everyone.
 */

export type OAuthProvider = "google" | "github";

/** Multicolor Google logo (inline — no external asset). */
export function GoogleGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Are we in the desktop app window?
 *
 * Read AFTER editing: `window.minddy` does not exist in server rendering, and the
 * assuming would cause hydration to diverge. So `false` at first rendering, in
 * the app as elsewhere — what depends on it must remain correct in both cases.
 */
export function useInDesktopApp(): boolean {
  const [inDesktopApp, setInDesktopApp] = useState(false);
  useEffect(() => setInDesktopApp(isDesktop()), []);
  return inDesktopApp;
}

/** The brand, with or without a link to the public site. */
export function LogoMark({ asLink }: { asLink: boolean }) {
  const mark = (
    <>
      <MinddyLogo
        className={cn("h-7 w-auto text-foreground", ENV_LOGO_TINT[getAppEnv()])}
      />
      <span className="font-display text-lg font-semibold tracking-tight">
        minddy
      </span>
    </>
  );
  const className = "inline-flex w-fit items-center gap-2 rounded-sm";
  return asLink ? (
    <Link
      href="/"
      aria-label="minddy"
      className={cn(
        className,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {mark}
    </Link>
  ) : (
    <div className={className}>{mark}</div>
  );
}

/**
 * A link to a public page from an auth screen.
 *
 * **In the desktop app, it opens the BROWSER** (MIN-292): the window does not
 * shows that authentication and the app, and a public page does not enter it.
 * The shell does have a safeguard for this, but it acts AFTER the fact — a
 * SPA navigation cannot be canceled, it can only return to the entrance, and it
 * would throw away the half-completed form. The right gesture is therefore not to
 * navigate at all.
 *
 * It remains a real `<a href>`: the link is copyable, openable in the middle, and
 * readable by a screen reader like any other.
 */
export function LegalLink({
  href,
  external,
  children,
}: {
  href: string;
  external: boolean;
  children: React.ReactNode;
}) {
  const className = "underline underline-offset-4 hover:text-foreground";
  if (!external) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        // Absolute, and built on the CURRENT origin: in development the
        // shell points to `localhost`, and a link to production
        // would open the wrong page.
        getDesktopBridge()?.openExternal(new URL(href, window.location.origin).href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * The mention of information at the point of collection (GDPR art. 13, MIN-119). She
 * lives under the REGISTRATION button and nowhere else: this is where
 * data is collected for the first time, a connection does not collect anything
 * de neuf.
 */
export function SignupLegalNotice({ external }: { external: boolean }) {
  const t = useTranslations("Auth");
  const locale = useLocale() as Locale;
  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground">
      {t.rich("signupLegalNotice", {
        terms: (chunks) => (
          <LegalLink href={localizedHref("/terms", locale)} external={external}>
            {chunks}
          </LegalLink>
        ),
        privacy: (chunks) => (
          <LegalLink href={localizedHref("/privacy", locale)} external={external}>
            {chunks}
          </LegalLink>
        ),
      })}
    </p>
  );
}

/**
 * Google and GitHub, the same button to connect and register: Supabase
 * creates the account on the first pass.
 */
export function OAuthButtons({
  pending,
  disabled,
  onSelect,
}: {
  pending: OAuthProvider | null;
  disabled: boolean;
  onSelect: (provider: OAuthProvider) => void;
}) {
  const t = useTranslations("Auth");
  return (
    <div className="space-y-2.5">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full justify-center gap-2.5"
        disabled={disabled}
        onClick={() => onSelect("google")}
      >
        {pending === "google" ? <Spinner /> : <GoogleGlyph />}
        {t("continueWithGoogle")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full justify-center gap-2.5"
        disabled={disabled}
        onClick={() => onSelect("github")}
      >
        {pending === "github" ? <Spinner /> : <Github className="size-4" />}
        {t("continueWithGitHub")}
      </Button>
    </div>
  );
}

/**
 * The “or by e-mail” line between the providers and the form.
 *
 * Two lines and a word between them, and not a word on an opaque background PLACED on a
 * continuous line: since the shell paints a colored halo, a `bg-background`
 * in the middle of the screen you can see — it's a gray dot on a green gradient.
 */
export function AuthSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** A field and its label — the same pair on both screens. */
export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The column of auth screens: the mark at the top left, the content at
 * center, all the way up. The bottom belongs to the shell
 * (`app/(auth)/auth-shell.tsx`) — both screens share it.
 *
 * In the desktop app, the logo does not lead anywhere: the public site is not there
 * space, and a link that immediately bounces back to here is worth less than a
 * mark installed (MIN-291).
 *
 * **And it shifts to the RIGHT.** macOS buttons are drawn by the system
 * above the web view, in the top left corner, and no `z-index` passes
 * in front: placed at `p-8`, the mark fell below. These screens do not have
 * sidebar to make a place for them in its brand line, therefore the corner
 * comes back to them in full and it is the brand that moves. The gesture is the same as
 * in the bar: a place swapped, nothing new on the screen.
 */
export function AuthColumn({
  inDesktopApp,
  children,
}: {
  inDesktopApp: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col p-8">
      <div className={cn("flex", inDesktopApp && "justify-end")}>
        <LogoMark asLink={!inDesktopApp} />
      </div>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}

/**
 * Password requirements, checked as you type.
 *
 * They were held by Supabase alone: ​​we typed, we clicked, and the server
 * responded in English with a list of conditions that we had never seen. THE
 * same rules are now evaluated here ([password-policy.ts](../../lib/password-policy.ts)),
 * and the button remains grayed out as long as they are not all held: the refusal of the
 * server becomes a fallback, not a dialog mode.
 *
 * `aria-live` on the list: the checkmark is visual information, and without it
 * a screen reader would never hear that the rule has just been satisfied.
 *
 * Shared by the two screens which set a password (MIN-297): the wizard
 * registration and setting a new password. The same rules
 * are required, they must be SAYING in the same way.
 */
export function PasswordRules({ password }: { password: string }) {
  const t = useTranslations("Auth");
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {checkPassword(password).map(({ id, met }) => (
        <li
          key={id}
          className={`flex items-center gap-2 text-xs transition-colors ${
            met ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
              met ? "border-transparent bg-emerald-600 text-white" : "border-border"
            }`}
          >
            {met && <Check className="size-3" strokeWidth={3} />}
          </span>
          {t(id, { min: MIN_PASSWORD_LENGTH })}
        </li>
      ))}
    </ul>
  );
}

/**
 * A gone email icon — the “look at your mailbox” screen.
 *
 * Placed on its isometric block (`IsoIcon`), like the empty states of the app and
 * the cards of the landing (MIN-254), and not a lucid face in a
 * round pellet: this pellet is the most neutral drawing possible, so
 * the one who doesn't say anything about minddy. This screen is the last of the route
 * registration, and the only one that only has one image to show.
 */
export function MailGlyph() {
  return <IsoIcon icon={Mail} className="mx-auto w-24" />;
}
