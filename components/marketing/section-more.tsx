import { getTranslations } from "next-intl/server";
import { Share2, FileInput, Plug } from "lucide-react";
import { CARD_TONES } from "./card-tones";
import { SectionHeading } from "./section-heading";

const ITEMS = [
  { key: "share", icon: Share2, tone: CARD_TONES.rose },
  { key: "import", icon: FileInput, tone: CARD_TONES.butter },
  { key: "api", icon: Plug, tone: CARD_TONES.sky },
] as const;

export async function SectionMore() {
  const t = await getTranslations("Landing");
  return (
    <section id="more" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={t("moreTitle")} description={t("moreSubtitle")} />
        <div className="grid gap-4 md:grid-cols-3">
          {ITEMS.map(item => (
            <article key={item.key} className={`rounded-2xl p-6 sm:p-8 ${item.tone}`}>
              <item.icon className="mb-12 size-8" strokeWidth={1.5} aria-hidden />
              <h3 className="mb-4 text-2xl font-medium tracking-tight">{t(`more_${item.key}_title`)}</h3>
              <p className="text-base leading-relaxed text-pretty opacity-80">{t(`more_${item.key}_body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
