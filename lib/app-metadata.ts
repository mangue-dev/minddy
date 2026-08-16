import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_NAME } from "@/lib/site";

/**
 * Métadonnées des pages de l'app interne (MIN-95).
 *
 * Chaque page derrière l'authentification recopiait les mêmes quatre lignes de
 * `getTranslations` pour ne poser qu'un titre ; aucune ne posait de
 * description. Une page = une clé, désormais : le namespace `Meta` porte le
 * couple `<clé>` / `<clé>Description`, et cette fabrique en fait le `Metadata`
 * que Next attend.
 *
 * Le `robots: noindex` n'est PAS posé ici — `app/(app)/layout.tsx` le porte une
 * fois pour tout le segment authentifié, et Next fusionne les métadonnées champ
 * par champ en descendant l'arbre.
 *
 * Une description sur une page non indexée ne pèse évidemment rien pour un
 * moteur de recherche. Elle est là pour qu'il n'y ait pas d'exception à retenir
 * — une page, un titre, une description — et parce que le même catalogue sert
 * les pages publiques, elles, bel et bien indexées.
 */

/** Les clés du namespace `Meta` qui décrivent une page. */
export type MetaPageKey =
  | "home"
  | "inbox"
  | "all"
  | "agents"
  | "routines"
  | "pullRequests"
  | "statistics"
  | "trash"
  | "billing"
  | "settings"
  | "admin"
  | "project"
  | "triage"
  | "pages"
  | "objectives"
  | "projectSettings"
  | "feedback"
  | "notFound"
  | "oauthAuthorize"
  | "oauthSuccess"
  | "emailConfirmed"
  | "confirmSignIn"
  | "forgotPassword"
  | "resetPassword";

/**
 * @param scope Contexte dynamique accolé au titre — le nom du projet sur les
 * sous-pages d'un projet : « Triage » + « Acme » donne « Triage · Acme · minddy ».
 *
 * La marque est recomposée à la main dans ce cas, au lieu d'être laissée au
 * template « %s · minddy » du root layout : Next résout un `title` chaîne en
 * `{ absolute, template: null }`, si bien qu'un layout intermédiaire qui pose un
 * titre — celui du projet — ANNULE le template pour tout son sous-arbre. Les
 * sous-pages d'un projet sortaient donc « Triage · Acme », sans marque, là où
 * toutes les autres pages du site la portent. Un `absolute` explicite ne dépend
 * plus de l'endroit où la page se trouve dans l'arbre.
 */
export async function appPageMetadata(
  key: MetaPageKey,
  scope?: string | null,
): Promise<Metadata> {
  const t = await getTranslations("Meta");
  const title = t(key);
  return {
    title: scope ? { absolute: `${title} · ${scope} · ${SITE_NAME}` } : title,
    description: t(`${key}Description`),
  };
}
