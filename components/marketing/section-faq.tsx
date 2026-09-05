import { getTranslations } from "next-intl/server";
import { FaqAccordion } from "./faq-accordion";
import { FAQ_KEYS } from "./faq-keys";
import { Reveal, RevealHeading } from "./reveal";

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
          className="mb-8 text-3xl font-medium tracking-[-0.035em] text-balance sm:text-4xl"
          text={t("faqTitle")}
        />
        <Reveal delay={0.12}>
          <FaqAccordion items={items} />
        </Reveal>
      </div>
    </section>
  );
}
