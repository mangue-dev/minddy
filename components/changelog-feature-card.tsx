"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { ChangelogFeatureDetail, ChangelogFeatureSummary, ChangelogLabels } from "@/lib/changelog-types";
import { FeatureDisclosureFrame } from "@/components/feature-disclosure";
import { ChangelogIllustration } from "@/components/changelog-illustration";
import styles from "./changelog-cards.module.css";

const ASPECT_RATIOS = { shield: 1, board: 1.5, assistant: 1.3, pages: 1.4, connections: 1.2, activity: 1.25, desktop: 1.5 };

/** Native details reuse the landing face replacement and load copy only on opening. */
export function ChangelogFeatureCard({ feature, labels, loadDetail, compact = false, reveal }: {
  feature: ChangelogFeatureSummary;
  labels: ChangelogLabels;
  loadDetail: (id: string) => Promise<ChangelogFeatureDetail>;
  compact?: boolean;
  reveal?: number;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ChangelogFeatureDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reveal || !disclosure.current) return;
    disclosure.current.open = true;
    disclosure.current.scrollIntoView({ block: "nearest" });
  }, [reveal]);
  useEffect(() => {
    if (!open || detail) return;
    let active = true;
    setError(false);
    loadDetail(feature.id).then(result => { if (active) setDetail(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, detail, loadDetail, feature.id, attempt]);

  const content = <>
    {!compact && <h3 className="mb-5 text-xl font-medium tracking-tight text-balance">{feature.title}</h3>}
    {detail ? <div className="space-y-4 text-pretty text-muted-foreground">{detail.details.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
      : error ? <div role="alert"><p>{labels.error}</p><button type="button" className="mt-3 underline underline-offset-4" onClick={() => setAttempt(a => a + 1)}>{labels.retry}</button></div>
        : <p role="status" className="text-muted-foreground">{labels.loading}</p>}
  </>;

  if (compact) return <details ref={disclosure} id={feature.id} onToggle={event => setOpen(event.currentTarget.open)} className="group scroll-mt-24">
    <summary aria-label={`${labels.details}: ${feature.title}`} className="flex list-none items-center justify-between gap-4 py-2 text-sm [&::-webkit-details-marker]:hidden">
      <span>{feature.title}</span>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/40 dark:bg-black/10 dark:hover:bg-black/20">
        <HugeiconsIcon icon={Add01Icon} className="size-5 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
      </span>
    </summary>
    <div className="max-w-2xl pb-4 text-sm leading-relaxed" role="region" aria-label={feature.title}>{content}</div>
  </details>;

  const illustration = feature.illustration;
  const ratio = illustration.kind === "image" ? Math.max(.85, Math.min(1.6, illustration.width / illustration.height)) : ASPECT_RATIOS[illustration.name];
  return <FeatureDisclosureFrame
    id={feature.id} title={feature.title} detailsLabel={labels.details} disclosureRef={disclosure}
    onToggle={event => setOpen(event.currentTarget.open)} className={`${styles.card} border border-border bg-card`}
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
