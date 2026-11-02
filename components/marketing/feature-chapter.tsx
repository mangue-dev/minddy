import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppIcon, type AppIcon as AppIconType } from "@/components/icon";
import { cn } from "@/lib/utils";
import { CardShot, type CardShotSource } from "./card-shot";
import { SOFT_TONES, type SoftTone } from "./card-tones";
import { PointCard } from "./point-card";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { StoryStepper, type StoryScene } from "./figures/story";

export interface ChapterPoint {
  icon: AppIconType;
  title: string;
  body: string;
  /** The card's illustration, a framed screenshot of the feature. */
  shot: CardShotSource;
  /** Kept for links shared before the landing rework (`/#voice`, `/#numo`…). */
  anchor?: string;
}

/**
 * The figure's tinted frame. Its radius is the inner surfaces' (12 px) plus
 * its padding, so the corners stay concentric at every breakpoint.
 */
export const FIGURE_FRAME = "rounded-3xl p-3 sm:rounded-[36px] sm:p-6";

/**
 * One chapter of the landing: what a feature family is for, shown on a live
 * figure, then the smaller features that come with it, each on a card with a
 * screenshot. The same rhythm in every chapter keeps a long page easy to scan.
 */
export function FeatureChapter({
  id,
  eyebrow,
  title,
  lede,
  figure,
  scenes,
  scenesLabel,
  figureClassName,
  leadPoints,
  points,
  tone,
  aside,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  figure?: ReactNode;
  /** Plays the figure as scenes the visitor can pick, listed beside it. */
  scenes?: readonly StoryScene[];
  scenesLabel?: string;
  /** The figure's backdrop and, with scenes, its fixed height. */
  figureClassName?: string;
  /** The chapter's main flow, as cards set apart above the smaller features. */
  leadPoints?: readonly ChapterPoint[];
  points: readonly ChapterPoint[];
  /** The cards' background family. */
  tone: SoftTone;
  /** A short note under the points, such as what a plan includes. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24", className)}
    >
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <Reveal as="p" className="text-sm font-medium text-primary">
            {eyebrow}
          </Reveal>
          <span id={`${id}-title`} className="contents">
            <RevealHeading
              text={title}
              className="mt-3 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-5xl"
            />
          </span>
          <Reveal
            as="p"
            delay={0.1}
            className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          >
            {lede}
          </Reveal>
        </header>

        {figure && scenes ? (
          <Reveal delay={0.15} className="mt-10 sm:mt-14">
            <StoryStepper
              scenes={scenes}
              label={scenesLabel ?? title}
              frameClassName={cn(FIGURE_FRAME, figureClassName)}
            >
              {figure}
            </StoryStepper>
          </Reveal>
        ) : figure ? (
          <Reveal
            as="figure"
            delay={0.15}
            className={cn("mt-10 overflow-hidden select-none sm:mt-14", FIGURE_FRAME, figureClassName)}
          >
            {figure}
          </Reveal>
        ) : null}

        {leadPoints && <PointGrid points={leadPoints} tone={tone} />}
        <PointGrid points={points} tone={tone} className={leadPoints && "mt-16 sm:mt-20"} />

        {aside && <p className="mt-10 text-sm text-muted-foreground">{aside}</p>}
      </div>
    </section>
  );
}

/**
 * The smaller features, one card each, all the same height. A code-built
 * illustration (`node`) is placed as is; a screenshot goes through `CardShot`.
 */
export async function PointGrid({
  points,
  tone,
  className,
}: {
  points: readonly ChapterPoint[];
  tone: SoftTone | readonly SoftTone[];
  className?: string;
}) {
  const t = await getTranslations("Landing");
  return (
    <RevealGroup as="ul" className={cn("mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {points.map((point, index) => (
        <PointCard
          key={point.title}
          anchor={point.anchor}
          icon={<AppIcon icon={point.icon} className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />}
          title={point.title}
          body={point.body}
          tone={SOFT_TONES[typeof tone === "string" ? tone : tone[index % tone.length]]}
          showLabel={t("cardShowDescription")}
          hideLabel={t("cardHideDescription")}
        >
          {"node" in point.shot ? point.shot.node : <CardShot source={point.shot} />}
        </PointCard>
      ))}
    </RevealGroup>
  );
}
