import { getTranslations } from "next-intl/server";
import { Reveal, RevealHeading } from "./reveal";
import { Share2, FileInput, Plug } from "lucide-react";

/** A compact integration strip for useful capabilities that need no full product chapter. */

const ITEMS = [
  { key: "share", icon: Share2 },
  { key: "import", icon: FileInput },
  { key: "api", icon: Plug },
] as const;

export async function SectionMore() {
  const t = await getTranslations("Landing");

  return (
    <section id="more" className="scroll-mt-24 border-t border-border bg-muted/20 py-14 sm:py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <header>
          <RevealHeading
            className="text-3xl font-medium tracking-[-0.035em] text-balance sm:text-4xl"
            text={t("moreTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mt-3 leading-relaxed text-pretty text-muted-foreground"
          >
            {t("moreSubtitle")}
          </Reveal>
        </header>

        <Reveal as="ul" className="grid gap-8 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-4">
              <item.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <div>
                <h3 className="mb-1 font-medium">{t(`more_${item.key}_title`)}</h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {t(`more_${item.key}_body`)}
                </p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
