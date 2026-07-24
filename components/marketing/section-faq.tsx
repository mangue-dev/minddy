import { getTranslations } from "next-intl/server";
import { FaqAccordion } from "./faq-accordion";
import { Reveal, RevealHeading } from "./reveal";

/** Questions posées avant l'inscription (MIN-73) : ce que voit l'agent, où
    vivent les données, comment marche la facturation à l'usage. */
export const FAQ_KEYS = [
  "agents",
  "byok",
  "usage",
  "data",
  "team",
  "migrate",
] as const;

export async function SectionFaq() {
  const t = await getTranslations("Landing");

  const items = FAQ_KEYS.map((key) => ({
    key,
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <RevealHeading
          className="mb-8 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
          text={t("faqTitle")}
        />
        <Reveal delay={0.12}>
          <FaqAccordion items={items} />
        </Reveal>
      </div>
    </section>
  );
}
