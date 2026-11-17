import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowUpRight01Icon,
  InboxIcon,
  MessageMultiple01Icon,
  PaintBoardIcon,
  ServerStack01Icon,
  Share08Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SCRATCHPAD_ICON } from "@/components/feature-icons";
import { Github } from "@/components/git/provider-icons";
import type { Locale } from "@/i18n/config";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";
import { localizedHref } from "@/lib/locale-href";
import { cn } from "@/lib/utils";
import { FeedbackRows, NotebookExcerpt } from "./figures/card-figures";
import { PointGrid, type ChapterPoint } from "./feature-chapter";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

/** The open-source card's two links, as pills on the card's color. */
const OPEN_SOURCE_LINK =
  "inline-flex min-h-12 items-center gap-2.5 rounded-full px-6 text-base font-medium transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

/** The smaller features, one card each with its screenshot. */
export async function SectionDetails() {
  const t = await getTranslations("Landing");
  const locale = (await getLocale()) as Locale;
  const points: ChapterPoint[] = [
    {
      icon: SCRATCHPAD_ICON,
      title: t("details_scratchpad_title"),
      body: t("details_scratchpad_body"),
      // `#scratchpad` and `#feedback` were sections before; links to them land here.
      anchor: "scratchpad",
      shot: { node: <NotebookExcerpt /> },
    },
    {
      icon: MessageMultiple01Icon,
      title: t("details_feedback_title"),
      body: t("details_feedback_body"),
      anchor: "feedback",
      shot: { node: <FeedbackRows /> },
    },
    {
      icon: Share08Icon,
      title: t("details_share_title"),
      body: t("details_share_body"),
      shot: { card: "share-view", crop: { x: 0, y: 0, w: 0.8 } },
    },
    {
      icon: InboxIcon,
      title: t("details_inbox_title"),
      body: t("details_inbox_body"),
      shot: { card: "inbox", crop: { x: 0, y: 0, w: 0.7 } },
    },
    {
      icon: SourceCodeIcon,
      title: t("details_openSource_title"),
      body: t("details_openSource_body"),
      shot: {
        node: (
          // No picture: the repository and the self-hosting guide, one click away, in the card's middle.
          <div className="-ml-8 flex h-full flex-col items-center justify-center gap-2.5 pb-10">
            <a
              href={MINDDY_REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(OPEN_SOURCE_LINK, "bg-background shadow-sm")}
            >
              <Github className="size-5" aria-hidden />
              {t("heroCtaSecondary")}
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" aria-hidden />
            </a>
            <Link href={localizedHref("/self-hosting", locale)} className={cn(OPEN_SOURCE_LINK, "bg-background/55")}>
              <HugeiconsIcon icon={ServerStack01Icon} className="size-5" aria-hidden />
              {t("navMenu_selfHosting_title")}
            </Link>
          </div>
        ),
      },
    },
    {
      icon: PaintBoardIcon,
      title: t("details_themes_title"),
      body: t("details_themes_body"),
      shot: { themes: "heroBoard", crop: { x: 0.18, y: 0.035, w: 0.32 } },
    },
  ];
  return (
    <section id="more" aria-labelledby="more-title" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionHeading id="more-title" title={t("detailsTitle")} description={t("detailsLede")} />
        </Reveal>
        <PointGrid points={points} tone={["rose", "peach", "sky", "butter", "sage", "lavender"]} className="mt-0" />
      </div>
    </section>
  );
}
