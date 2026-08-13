"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Spinner, cn } from "mangue-ui";
import { Github, Mail } from "lucide-react";
import { MinddyLogo } from "@/components/minddy-logo";
import { IsoIconTile } from "@/components/marketing/iso-tile";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { getDesktopBridge, isDesktop } from "@/lib/desktop/bridge";

/**
 * Ce que la connexion et l'inscription ont en commun (MIN-300).
 *
 * Les deux écrans ont divergé le jour où l'inscription est devenue un parcours
 * à part (`/signup`) et la connexion une simple carte centrée (`/login`). Ce
 * qu'ils partagent est ce qui ne dépend d'aucun des deux : la marque, les
 * boutons de provider, les mentions légales, et le fait de savoir si l'on est
 * dans la fenêtre de l'app de bureau. Le reste appartient à chacun.
 */

export type OAuthProvider = "google" | "github";

/** Logo Google multicolore (inline — pas d'asset externe). */
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
 * Sommes-nous dans la fenêtre de l'app de bureau ?
 *
 * Lu APRÈS le montage : `window.minddy` n'existe pas au rendu serveur, et le
 * supposer ferait diverger l'hydratation. Donc `false` au premier rendu, dans
 * l'app comme ailleurs — ce qui en dépend doit rester juste dans les deux cas.
 */
export function useInDesktopApp(): boolean {
  const [inDesktopApp, setInDesktopApp] = useState(false);
  useEffect(() => setInDesktopApp(isDesktop()), []);
  return inDesktopApp;
}

/** La marque, avec ou sans lien vers le site public. */
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
 * Un lien vers une page publique depuis un écran d'auth.
 *
 * **Dans l'app de bureau, il ouvre le NAVIGATEUR** (MIN-292) : la fenêtre ne
 * montre que l'authentification et l'app, et une page publique n'y entre pas.
 * La coquille a bien un garde-fou pour ça, mais il agit APRÈS coup — une
 * navigation SPA n'est pas annulable, il ne peut que ramener à l'entrée, et il
 * jetterait le formulaire à moitié rempli. Le geste juste est donc de ne pas
 * naviguer du tout.
 *
 * Ça reste un vrai `<a href>` : le lien est copiable, ouvrable au milieu, et
 * lisible par un lecteur d'écran comme n'importe quel autre.
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
        // Absolue, et bâtie sur l'origine COURANTE : en développement la
        // coquille pointe sur `localhost`, et un lien vers la production
        // ouvrirait la mauvaise page.
        getDesktopBridge()?.openExternal(new URL(href, window.location.origin).href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * La mention d'information au point de collecte (RGPD art. 13, MIN-119). Elle
 * vit sous le bouton d'INSCRIPTION et nulle part ailleurs : c'est là que des
 * données sont collectées pour la première fois, une connexion ne collecte rien
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
 * Google et GitHub, le même bouton pour se connecter et s'inscrire : Supabase
 * crée le compte au premier passage.
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
 * Le trait « ou par e-mail » entre les providers et le formulaire.
 *
 * Deux traits et un mot entre eux, et non un mot sur fond opaque POSÉ sur un
 * trait continu : depuis que la coquille peint un halo coloré, un `bg-background`
 * au milieu de l'écran se voit — c'est une pastille grise sur un dégradé vert.
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

/** Un champ et son étiquette — la même paire sur les deux écrans. */
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
 * La colonne des écrans d'auth : la marque en haut à gauche, le contenu au
 * centre, sur toute la hauteur. Le fond, lui, appartient à la coquille
 * (`app/(auth)/auth-shell.tsx`) — les deux écrans le partagent.
 *
 * Dans l'app de bureau, le logo ne ramène nulle part : le site public n'y a pas
 * de place, et un lien qui rebondirait aussitôt vers ici vaut moins qu'une
 * marque posée (MIN-291).
 *
 * **Et il passe à DROITE.** Les boutons macOS sont dessinés par le système
 * par-dessus la vue web, dans le coin haut-gauche, et aucun `z-index` ne passe
 * devant : posée à `p-8`, la marque tombait dessous. Ces écrans-là n'ont pas de
 * barre latérale pour leur faire une place dans sa ligne de marque, donc le coin
 * leur revient en entier et c'est la marque qui bouge. Le geste est le même que
 * dans la barre : une place échangée, rien de neuf à l'écran.
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
 * L'icône d'un e-mail parti — l'écran « regardez votre boîte mail ».
 *
 * Couchée dans le plan isométrique (`IsoIconTile`), comme les états vides de
 * l'app et les cartes de la landing (MIN-254), et non une lucide de face dans
 * une pastille ronde : cette pastille-là est le dessin le plus neutre possible,
 * donc celui qui ne dit rien de minddy. Cet écran est le dernier du parcours
 * d'inscription, et le seul qui n'ait qu'une image à montrer.
 */
export function MailGlyph() {
  return <IsoIconTile icon={Mail} className="mx-auto w-24" />;
}
