import { detectFromAcceptLanguage } from "./accept-language";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * La langue de l'INTERFACE, lue depuis le navigateur.
 *
 * Le serveur a déjà la sienne (`i18n/request.ts`) et n'a pas besoin de ceci.
 * Ce module existe pour les deux gestes qui se jouent hors rendu, dans
 * `AuthProvider` :
 *
 *   — l'inscription, qui pose `locale` dans `user_metadata` (`signUp({ data })`) ;
 *   — la remise à niveau des comptes existants, à chaque session.
 *
 * Pourquoi le stocker dans les métadonnées alors que le cookie suffit à l'app :
 * les e-mails d'authentification (confirmation d'inscription, réinitialisation
 * de mot de passe) sont rendus par GoTrue, sur ses serveurs, sans requête ni
 * cookie — `user_metadata` est la SEULE chose qu'il sache du destinataire.
 * Voir `supabase/email-templates/`, qui branche dessus. Un champ qui n'est pas
 * tenu à jour ici, c'est un e-mail dans la mauvaise langue là-bas.
 */

/** Module pur, pour que le test n'ait pas à monter un `document`. */
export function resolveInterfaceLocale({
  cookieHeader,
  languages,
}: {
  cookieHeader: string;
  languages: readonly string[];
}): Locale {
  const fromCookie = readCookie(cookieHeader, "NEXT_LOCALE");
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }
  // Pas de cookie : c'est le cas NORMAL d'une inscription. Le cookie n'est écrit
  // que par les sélecteurs de langue, donc un visiteur qui n'a jamais changé de
  // langue n'en a pas — alors qu'il a bien vu l'app dans la langue déduite de
  // son navigateur, celle que le serveur a résolue pour lui. Sans ce repli,
  // toute inscription française serait enregistrée en anglais.
  return detectFromAcceptLanguage(languages.join(",")) ?? defaultLocale;
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.split("=");
    if (rawKey.trim() === name) return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

/** Le même, branché sur le navigateur. Rend `defaultLocale` hors navigateur. */
export function readInterfaceLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  return resolveInterfaceLocale({
    cookieHeader: document.cookie,
    languages: navigator.languages?.length
      ? navigator.languages
      : [navigator.language].filter(Boolean),
  });
}
