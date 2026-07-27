import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { detectFromAcceptLanguage } from "../lib/accept-language";
import { defaultLocale, locales, type Locale } from "./config";

/**
 * Ordre de résolution : locale demandée explicitement → en-tête
 * `x-minddy-locale` → cookie `NEXT_LOCALE` → `Accept-Language` →
 * `defaultLocale`.
 *
 * **La demande explicite d'abord** (MIN-93). next-intl passe ici le `locale`
 * donné à `getTranslations({ locale: "fr" })` ; ce fichier l'ignorait, donc
 * l'appel ne servait à rien : la langue restait celle de la REQUÊTE. Invisible
 * jusqu'ici, parce que les seuls appelants explicites (`/md`, `/og`) sont
 * atteints par une réécriture du proxy qui pose déjà l'en-tête — mais le flux
 * RSS du changelog, lui, est demandé en direct (`/changelog/rss.xml?locale=fr`)
 * et renvoyait un flux annoncé `fr-fr` rempli de titres anglais.
 *
 * Le paramètre est `undefined` partout ailleurs : sur un rendu de page normal,
 * la chaîne ci-dessous est inchangée.
 *
 * L'en-tête vient EN PREMIER et il est posé par le proxy sur les six pages
 * publiques (MIN-88) : c'est l'URL qui décide de la langue d'une page indexable
 * (`/fr/tarifs` est française, quoi qu'en dise le cookie du visiteur), pas une
 * préférence stockée. Sans cette priorité, un visiteur dont le cookie dit « en »
 * verrait `/fr` en anglais — et Google indexerait deux URLs au contenu
 * identique.
 *
 * Le cookie reprend la main partout ailleurs : c'est la langue de l'app
 * interne, qui n'a pas d'URL localisée et n'a pas à en avoir.
 *
 * Un seul point de résolution aligne d'un coup les Server Components
 * (`getTranslations`), le `NextIntlClientProvider` du root layout, les
 * composants clients (`useLocale`) et l'attribut `<html lang>`.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const fromHeader = headerStore.get("x-minddy-locale");
  const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;

  const locale =
    pick(requested) ??
    pick(fromHeader) ??
    pick(fromCookie) ??
    detectFromAcceptLanguage(headerStore.get("accept-language")) ??
    defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

function pick(raw: string | null | undefined): Locale | null {
  return raw && (locales as readonly string[]).includes(raw) ? (raw as Locale) : null;
}
