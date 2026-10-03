import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type { ReactEventHandler, ReactNode, Ref } from "react";
import { cn } from "mangue-ui/lib/utils";
import styles from "@/components/marketing/feature-disclosure.module.css";

/** Shared native card disclosure for the landing and release changelog. */
export function FeatureDisclosureFrame({
  id, title, children, details, className, detailsLabel, onToggle, disclosureRef,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  details?: ReactNode;
  className?: string;
  detailsLabel: string;
  onToggle?: ReactEventHandler<HTMLDetailsElement>;
  disclosureRef?: Ref<HTMLDetailsElement>;
}) {
  return (
    <article id={id} className={cn(styles.card, "min-w-0 scroll-mt-24 rounded-2xl", className)}>
      <div className={styles.front}>{children}</div>
      {details && <details ref={disclosureRef} onToggle={onToggle} className={styles.disclosure}>
        <summary
          aria-label={`${detailsLabel}: ${title}`}
          className={cn(styles.toggle, "flex size-12 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current dark:bg-black/10 dark:hover:bg-black/20")}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-5 transition-transform duration-200 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className={styles.content} role="region" aria-label={title} tabIndex={0}>
          <div className="text-sm leading-relaxed">{details}</div>
        </div>
      </details>}
    </article>
  );
}
