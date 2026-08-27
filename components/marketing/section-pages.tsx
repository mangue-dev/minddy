import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * The project wiki is a product surface, not a small feature card. Its copy is
 * limited to behavior verified in the editor, publishing, history, and MCP tools.
 */

const POINTS = [
  { key: "write", icon: "pages" },
  { key: "link", icon: "share" },
  { key: "agents", icon: "message" },
  { key: "publish", icon: "api" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

export async function SectionPages() {
  const t = await getTranslations("Landing");

  return (
    <section id="pages" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mb-10 max-w-2xl sm:mb-12">
          <RevealHeading
            className="max-w-2xl text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("pagesTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mt-3 leading-relaxed text-pretty text-muted-foreground"
          >
            {t("pagesSubtitle")}
          </Reveal>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
          <Reveal as="figure" className="flex flex-col gap-3">
            <ScreenshotSlot id="pagesEditor" />
            <figcaption className="text-sm text-muted-foreground">
              {t("pagesCaption")}
            </figcaption>
          </Reveal>

          <Reveal as="ul" delay={0.1} className="divide-y divide-border border-y border-border">
            {POINTS.map((point) => (
              <li key={point.key} className="flex gap-4 py-5">
                <IsoTile name={point.icon} className="w-10 shrink-0" />
                <div>
                  <h3 className="font-medium">{t(`pages_${point.key}_title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t(`pages_${point.key}_body`)}
                  </p>
                </div>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
