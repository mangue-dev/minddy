import { getTranslations } from "next-intl/server";
import { AtIcon, Book02Icon, DatabaseIcon, UserGroupIcon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { NumoFace } from "@/components/numo-face";
import { cn } from "@/lib/utils";
import { CARD_TONES } from "./card-tones";
import { FIGURE_FRAME, PointGrid } from "./feature-chapter";
import { DatabaseRows, LiveEditing, MentionBento, NumoComposer, VersionHistory, WikiTree } from "./figures/card-figures";
import { PagesFlow } from "./figures/pages-flow";
import { Reveal, RevealHeading } from "./reveal";

/**
 * Writing: first the editor every surface shares (issues, plans, objectives,
 * pages), written live by the team and Numo; then what only pages have.
 */
export async function SectionPages() {
  const t = await getTranslations("Landing");
  return (
    <section id="pages" aria-labelledby="pages-title" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <Reveal as="p" className="text-sm font-medium text-primary">
            {t("pagesEyebrow")}
          </Reveal>
          <span id="pages-title" className="contents">
            <RevealHeading
              text={t("pagesHeadline")}
              className="mt-3 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-5xl"
            />
          </span>
          <Reveal
            as="p"
            delay={0.1}
            className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          >
            {t("pagesLede")}
          </Reveal>
        </header>

        <Reveal as="figure" delay={0.15} className={cn("mt-10 overflow-hidden select-none sm:mt-14", FIGURE_FRAME, CARD_TONES.lavender)}>
          <PagesFlow />
        </Reveal>

        <PointGrid
          tone="lavender"
          points={[
            {
              icon: UserGroupIcon,
              title: t("pages_live_title"),
              body: t("pages_live_body"),
              shot: { node: <LiveEditing /> },
            },
            {
              icon: AtIcon,
              title: t("pages_mentions_title"),
              body: t("pages_mentions_body"),
              shot: { node: <MentionBento /> },
            },
            {
              icon: NumoFace,
              title: t("pages_numo_title"),
              body: t("pages_numo_body"),
              shot: { node: <NumoComposer prompt="cardNumo_page" /> },
            },
          ]}
        />

        <div className="mt-16 max-w-2xl">
          <h3 className="text-xl font-medium tracking-tight">{t("pagesOnlyTitle")}</h3>
          <p className="mt-2 leading-relaxed text-pretty text-muted-foreground">{t("pagesOnlyBody")}</p>
        </div>
        <PointGrid
          className="mt-6"
          tone="lavender"
          points={[
            {
              icon: Book02Icon,
              title: t("pages_wiki_title"),
              body: t("pages_wiki_body"),
              shot: { node: <WikiTree /> },
            },
            {
              icon: DatabaseIcon,
              title: t("pages_db_title"),
              body: t("pages_db_body"),
              shot: { node: <DatabaseRows /> },
            },
            {
              icon: WorkHistoryIcon,
              title: t("pages_history_title"),
              body: t("pages_history_body"),
              shot: { node: <VersionHistory /> },
            },
          ]}
        />
      </div>
    </section>
  );
}
