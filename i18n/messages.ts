import type { AbstractIntlMessages } from "next-intl";
import type { Locale } from "./config";

const importers: Record<Locale, () => Promise<{ default: AbstractIntlMessages }>> = {
  en: () => import("@/messages/en.json") as Promise<{ default: AbstractIntlMessages }>,
  fr: () => import("@/messages/fr.json") as Promise<{ default: AbstractIntlMessages }>,
  de: () => import("@/messages/de.json") as Promise<{ default: AbstractIntlMessages }>,
  "pt-BR": () => import("@/messages/pt-BR.json") as Promise<{ default: AbstractIntlMessages }>,
  it: () => import("@/messages/it.json") as Promise<{ default: AbstractIntlMessages }>,
  es: () => import("@/messages/es.json") as Promise<{ default: AbstractIntlMessages }>,
};

/** Load the complete catalog for the requested product locale. */
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  return (await importers[locale]()).default;
}
