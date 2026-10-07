"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { ChangelogFeatureSummary, ChangelogLabels } from "@/lib/changelog-types";
import { FeatureDisclosureFrame } from "@/components/feature-disclosure";
import { ChangelogIllustration } from "@/components/changelog-illustration";
import { CHANGELOG_ASPECT_RATIOS, resolveChangelogIllustration } from "@/lib/changelog-illustrations";
import styles from "./changelog-cards.module.css";

/** Localized details are already rendered, so native disclosures open immediately. */
export function ChangelogFeatureCard({ feature, labels, compact = false, reveal }: {
  feature: ChangelogFeatureSummary;
  labels: ChangelogLabels;
  compact?: boolean;
  reveal?: number;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!reveal || !disclosure.current) return;
    disclosure.current.open = true;
    disclosure.current.scrollIntoView({ block: "nearest" });
  }, [reveal]);

  const content = <>
    {!compact && <h3 className="mb-5 text-xl font-medium tracking-tight text-balance">{feature.title}</h3>}
    <div className="space-y-4 text-pretty text-muted-foreground">{feature.details.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
  </>;

  if (compact) return <details ref={disclosure} id={feature.id} className="group scroll-mt-24">
    <summary aria-label={`${labels.details}: ${feature.title}`} className="flex list-none items-center justify-between gap-4 py-2 text-sm [&::-webkit-details-marker]:hidden">
      <span>{feature.title}</span>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/40 dark:bg-black/10 dark:hover:bg-black/20">
        <HugeiconsIcon icon={Add01Icon} className="size-5 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
      </span>
    </summary>
    <div className="max-w-2xl pb-4 text-sm leading-relaxed" role="region" aria-label={feature.title}>{content}</div>
  </details>;

  const illustration = resolveChangelogIllustration(feature.id, feature.illustration);
  const ratio = illustration.kind === "image" ? Math.max(.85, Math.min(1.6, illustration.width / illustration.height)) : CHANGELOG_ASPECT_RATIOS[illustration.name];
  return <FeatureDisclosureFrame
    id={feature.id} title={feature.title} detailsLabel={labels.details} disclosureRef={disclosure}
    className={`${styles.card} border border-border bg-card`}
    details={content}
  >
    <div className={styles.illustration}>
      <ChangelogIllustration illustration={illustration} aspectRatio={ratio} className={styles.figure} />
    </div>
    <div className="px-6 pt-3 pb-22 sm:px-8">
      <h3 className="text-xl font-medium tracking-tight text-balance">{feature.title}</h3>
    </div>
  </FeatureDisclosureFrame>;
}
