"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Mail01Icon, CheckIcon, ServerStack01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Github } from "@/components/git/provider-icons";
import { MinddyLogo } from "@/components/minddy-logo";
import { IsoIcon } from "@/components/illustrations/iso-icon";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/password-policy";
import { getDesktopBridge, isDesktop } from "@/lib/desktop/bridge";
import { getMobileBridge } from "@/lib/mobile/bridge";
import type { OAuthProvider } from "@/lib/auth-context";
import { keyboardFrameStyle, useKeyboardFrame } from "@/lib/mobile/use-keyboard-frame";

/**
 * What login and registration have in common (MIN-300).
 *
 * The two screens diverged the day registration became a course
 * apart (`/signup`) and the connection a simple centered card (`/login`). This
 * that they share is what does not depend on either of them: the brand, the
 * provider buttons, legal notices, and knowing if you are
 * in the desktop app window. The rest is up to everyone.
 */

export type { OAuthProvider } from "@/lib/auth-context";

/**
 * The main button of every auth screen (MIN-781): taller than the fields so it
 * reads as the step's single action. No shadow: like every button, it sits on
 * the page rather than above it. Shared so sign-in, sign-up, password and 2FA
 * screens keep one button.
 */
export const AUTH_SUBMIT_CLASS =
  "group/submit h-12 w-full justify-center gap-2 rounded-full text-[15px] font-semibold tracking-tight";

/** The arrow after a submit label; it nudges forward on hover. */
export function SubmitArrow() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      aria-hidden
      className="size-4 transition-transform group-hover/submit:translate-x-0.5"
    />
  );
}

/**
 * The shape of an auth form while it loads (MIN-868): the heading and its
 * subtitle, the provider buttons when the form has them, the fields and the
 * main button, at their real heights so the form lands where they stood.
 */
export function AuthFormSkeleton({
  fields = 2,
  providers = 0,
}: {
  fields?: number;
  providers?: number;
}) {
  const t = useTranslations("Common");
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="space-y-2.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {providers > 0 && (
        <div aria-hidden className="space-y-2.5">
          {Array.from({ length: providers }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      )}
      <div aria-hidden className="space-y-4">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}

/**
 * What an auth page shows while its form loads: the form's column with the
 * brand in place and the form's shape below it. The auth shell lays
 * full-bleed screens out as a row (the form, then the showcase), so this
 * fills the column like the form will.
 */
export function AuthLoading({
  fields = 2,
  providers = 2,
}: {
  fields?: number;
  providers?: number;
} = {}) {
  return (
    <div className="auth-column flex w-full flex-1 flex-col p-8">
      <div className="flex flex-1 flex-col items-center justify-center py-10">
        <div className="mb-8 flex justify-center">
          <LogoMark asLink={false} />
        </div>
        <div className="w-full max-w-[380px]">
          <AuthFormSkeleton fields={fields} providers={providers} />
        </div>
      </div>
    </div>
  );
}

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
 * Apple's logo, in the button's text color as Apple's guidelines ask: the
 * logo and the title share one color.
 */
export function AppleGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
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
 * The sign-in services the server offers, one button each, Apple first (it
 * is the one an iPhone already knows). The same buttons sign in and
 * register, since Supabase creates the account on a provider's first pass.
 */
export function OAuthButtons({
  providers,
  pending,
  disabled,
  onSelect,
}: {
  providers: OAuthProvider[];
  pending: OAuthProvider | null;
  disabled: boolean;
  onSelect: (provider: OAuthProvider) => void;
}) {
  const t = useTranslations("Auth");
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {providers.includes("apple") && (
        // Apple's guidelines allow a white button with an outline on a light
        // page and a white one on a dark page, never a dark outlined one: the
        // dark theme therefore fills it. Same size as the others (4.8).
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full justify-center gap-2.5 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90 dark:hover:text-black"
          disabled={disabled}
          onClick={() => onSelect("apple")}
        >
          <ServiceLabel glyph={pending === "apple" ? <Spinner /> : <AppleGlyph />}>{t("continueWithApple")}</ServiceLabel>
        </Button>
      )}
      {providers.includes("google") && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full justify-center gap-2.5"
          disabled={disabled}
          onClick={() => onSelect("google")}
        >
          <ServiceLabel glyph={pending === "google" ? <Spinner /> : <GoogleGlyph />}>{t("continueWithGoogle")}</ServiceLabel>
        </Button>
      )}
      {providers.includes("github") && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full justify-center gap-2.5"
          disabled={disabled}
          onClick={() => onSelect("github")}
        >
          <ServiceLabel glyph={pending === "github" ? <Spinner /> : <Github className="size-4" />}>{t("continueWithGitHub")}</ServiceLabel>
        </Button>
      )}
    </div>
  );
}

/** A service's logo and name, centered together in its button. */
function ServiceLabel({ glyph, children }: { glyph: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center justify-center gap-2.5">
      <span className="flex size-4 shrink-0 items-center justify-center">{glyph}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** The line between the address and the sign-in services. */
export function OrDivider() {
  const t = useTranslations("Common");
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {t("or")}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** The list of methods while the server has not said which it offers. */
export function AuthMethodsSkeleton() {
  const t = useTranslations("Common");
  return (
    <div role="status" aria-busy="true" className="space-y-2.5">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton aria-hidden className="h-12 w-full rounded-full" />
      <Skeleton aria-hidden className="h-12 w-full rounded-full" />
    </div>
  );
}

/** Returns to the previous step: a filled button, like every other action of these screens. */
export function AuthBackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useTranslations("Common");
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled} className="h-12 w-full justify-center rounded-full">
      {t("back")}
    </Button>
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
 * The column of auth screens: the mark centered above the content, both in
 * the middle of the height the shell's column leaves (MIN-907). The bottom
 * belongs to the shell (`app/(auth)/auth-shell.tsx`).
 *
 * In the desktop app, the logo does not lead anywhere: the public site is not
 * there, and a link that immediately bounces back here is worth less than a
 * mark (MIN-291).
 *
 * **While the software keyboard is up** the column fits the part of the
 * screen it leaves and starts at its top, so the field being typed in and the
 * button under it stay in sight together; what follows scrolls.
 */
export function AuthColumn({
  inDesktopApp,
  footer = <SelfHostButton />,
  children,
}: {
  inDesktopApp: boolean;
  /** Under the content; the self-hosting way in by default. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const keyboard = useKeyboardFrame();
  const typing = keyboard.height !== null;
  return (
    <div
      // `.auth-shell` pads its sides by these insets (app/tokens.css).
      style={keyboardFrameStyle(keyboard, "var(--safe-inline-start) var(--safe-inline-end)")}
      className={cn(
        "auth-column flex w-full flex-1 flex-col p-8",
        typing && "overflow-y-auto overscroll-contain bg-background",
      )}
    >
      <div className={cn("flex flex-1 flex-col items-center py-10", typing ? "justify-start py-4" : "justify-center")}>
        <div className="mb-8 flex justify-center">
          <LogoMark asLink={!inDesktopApp} />
        </div>
        {/* Each block of the form arrives in turn, with a short blur and fade
            (`.auth-stagger`, globals.css); the brand above never moves. */}
        <div className="auth-stagger w-full max-w-[380px]">{children}</div>
      </div>
      {footer}
    </div>
  );
}

/**
 * The way into self-hosting from the desktop app (MIN-781). The app starts on
 * minddy Cloud's sign-up, like the web; this button, under every auth form,
 * opens the app's bundled self-hosting page (install on this computer or a
 * server, or use an existing installation), which works offline. Builds whose
 * bridge cannot open it show nothing.
 *
 * The mobile app (MIN-907) shows the same button: it opens the app's bundled
 * page to connect to a self-hosted server.
 */
export function SelfHostButton() {
  const t = useTranslations("DesktopWelcome");
  // Shown by CSS from the first paint (`data-desktop-app`, set by the
  // pre-paint script), not after an effect: arriving late, it would push the
  // vertically centred form up mid-entrance.
  return (
    <div className="hidden justify-center [html[data-desktop-app]_&]:flex [html[data-native-mobile]_&]:flex">
      <button
        type="button"
        onClick={() => {
          getDesktopBridge()?.openServerPicker?.();
          void getMobileBridge()?.shell?.openServerPicker();
        }}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon icon={ServerStack01Icon} className="size-4" />
        {t("selfHostHeading")}
      </button>
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
            {met && <HugeiconsIcon icon={CheckIcon} className="size-3" strokeWidth={3} />}
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
 * Drawn as an illustration (`IsoIcon`), like the empty states of the app and
 * the cards of the landing (MIN-254), and not a lucid face in a
 * round pellet: this pellet is the most neutral drawing possible, so
 * the one who doesn't say anything about minddy. This screen is the last of the route
 * registration, and the only one that only has one image to show.
 */
export function MailGlyph() {
  return <IsoIcon icon={Mail01Icon} className="mx-auto w-24" />;
}
