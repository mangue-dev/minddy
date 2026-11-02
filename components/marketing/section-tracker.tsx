import { getTranslations } from "next-intl/server";
import {
  ChartHistogramIcon,
  FileImportIcon,
  HierarchySquare01Icon,
  InboxDownloadIcon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import { BOARD_ICON } from "@/components/feature-icons";
import { cn } from "@/lib/utils";
import { CARD_TONES } from "./card-tones";
import { ImportSources, ProjectSidebar, StatsChart, TriageActions, ViewTabs } from "./figures/card-figures";
import { PointGrid } from "./feature-chapter";
import { Reveal, RevealHeading } from "./reveal";

/**
 * Projects: first that every project lives in one place (one sidebar, one
 * board across them, one cycle), then what each project holds.
 */
export async function SectionTracker() {
  const t = await getTranslations("Landing");
  return (
    <section id="tracker" aria-labelledby="tracker-title" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <Reveal as="p" className="text-sm font-medium text-primary">
            {t("trackerEyebrow")}
          </Reveal>
          <span id="tracker-title" className="contents">
            <RevealHeading
              text={t("trackerTitle")}
              className="mt-3 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-5xl"
            />
          </span>
          <Reveal
            as="p"
            delay={0.1}
            className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          >
            {t("trackerLede")}
          </Reveal>
        </header>

        {/* All projects in one place: the cross-project board, sidebar included. */}
        <Reveal
          delay={0.15}
          className={cn(
            "mt-10 grid overflow-hidden rounded-[36px] sm:mt-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]",
            CARD_TONES.sage,
          )}
        >
          <div className="flex flex-col justify-end gap-3 p-7 sm:p-10">
            <h3 className="text-2xl font-medium tracking-tight">{t("tracker_all_title")}</h3>
            <p className="leading-relaxed text-pretty opacity-80">{t("tracker_all_body")}</p>
          </div>
          <div className="relative h-80 px-8 pt-8 sm:h-[26rem] lg:pt-12">
            <ProjectSidebar />
          </div>
        </Reveal>

        <h3 className="mt-16 text-xl font-medium tracking-tight">{t("trackerPerProject")}</h3>
        <PointGrid
          className="mt-6"
          tone="sage"
          points={[
            {
              icon: BOARD_ICON,
              title: t("tracker_views_title"),
              body: t("tracker_views_body"),
              shot: { node: <ViewTabs /> },
            },
            {
              icon: Target01Icon,
              title: t("tracker_objectives_title"),
              body: t("tracker_objectives_body"),
              shot: { card: "objective", crop: { x: 0, y: 0, w: 0.6 } },
            },
            {
              icon: HierarchySquare01Icon,
              title: t("tracker_dependencies_title"),
              body: t("tracker_dependencies_body"),
              shot: { card: "relations", crop: { x: 0, y: 0, w: 0.68 } },
            },
            {
              icon: InboxDownloadIcon,
              title: t("tracker_triage_title"),
              body: t("tracker_triage_body"),
              shot: { node: <TriageActions /> },
            },
            {
              icon: ChartHistogramIcon,
              title: t("tracker_stats_title"),
              body: t("tracker_stats_body"),
              shot: { node: <StatsChart /> },
            },
            {
              icon: FileImportIcon,
              title: t("tracker_import_title"),
              body: t("tracker_import_body"),
              shot: { node: <ImportSources /> },
            },
          ]}
        />
      </div>
    </section>
  );
}
