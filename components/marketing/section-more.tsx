import { getTranslations } from "next-intl/server";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §6 — “And the rest is already there” (new section).
 *
 * The “all-in-one” half of the positioning was not stated anywhere: the
 * page demonstrated simplicity and led people to believe that it was paid for in
 * missing features. These three exist, are sellable, and
 * had no space — too small for a section, too useful to be
 * killed.
 *
 * THE PAGES ARE NOT THERE, and were there for a while (MIN-254). The wiki by
 * project was missing from the landing, it was entered here in one line, and it was twice
 * wrong: an entire surface of the product is not said in a strip of
 * end of argument. It now has its section (`section-pages.tsx`). What
 * remains here is indeed the nature of this tape - connections.
 *
 * Short tape without capture, DELIBERATELY: this is what prevents the section
 * from becoming a catalog and contradicting the title of §2 ("Nothing more ).
 * The completeness/simplicity tension is resolved in the subtitle — everything is there,
 * but there is only one way to do everything.
 *
 * What was left out knowingly: the statistics, the subtickets and
 * the relationships « blocks/blocked by”. They also exist; adding them would make
 * exactly the catalog we are avoiding.
 *
 * Two entries have been removed. OUTGOING WEBHOOKS do not exist: the
 * only `app/api/webhooks/*` routes receive GitHub and GitLab, minddy does not
 * prevent any third-party tools. And languages ​​and themes are not a selling point: it's a display preference, in its place in account settings, not in a page that promises sobriety.
 */

const ITEMS = [
  { key: "share", icon: "share" },
  { key: "import", icon: "import" },
  { key: "api", icon: "api" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

export async function SectionMore() {
  const t = await getTranslations("Landing");

  return (
    <section id="more" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("moreTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("moreSubtitle")}
          </Reveal>
        </header>

        {/* Four lines, not four cards: the strip should be read at a glance and read like a list at the end of an argument, not like a second product grid. */}
        <Reveal as="ul" className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
          {ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-4">
              <IsoTile name={item.icon} className="mt-0.5 w-12 shrink-0" />
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
