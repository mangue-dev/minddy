import { getLocale, getTranslations } from "next-intl/server";
import { getAppConfigValue } from "@/lib/server/app-config";
import type { FaqSection } from "@/lib/server/faq-answer";
import { FaqAsk, type FaqAskStrings } from "./faq-ask";

/**
 * The SERVER envelope of the FAQ ask box (MIN-590), same shape as the
 * dictation demo's (`voice-demo.tsx`): the strings cross as props because the
 * public browser feed carries only the whitelisted namespaces
 * (`lib/public-client-messages.ts`), and the row disappears entirely when the
 * `faq_ask_enabled` admin switch is off. Rendered inside the accordion root
 * (`FaqAccordion`'s `footer`) so it reads as the list's last row.
 */
export async function FaqAskBox({ section }: { section: FaqSection }) {
  const enabled = await getAppConfigValue("faq_ask_enabled");
  if ((enabled ?? "true").trim() === "false") return null;

  const [t, locale] = await Promise.all([getTranslations("FaqAsk"), getLocale()]);

  return (
    <FaqAsk
      section={section}
      locale={locale}
      strings={
        {
          placeholder: t("placeholder"),
          submitAria: t("submitAria"),
          loading: t("loading"),
          error: t("error"),
        } satisfies FaqAskStrings
      }
    />
  );
}
