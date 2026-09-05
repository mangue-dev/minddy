import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui/lib/utils";
import styles from "./feature-disclosure.module.css";

/** Details replace the card face while the native summary stays in one position. */
export async function FeatureDisclosure({
  id, title, children, details, className,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  details?: ReactNode;
  className?: string;
}) {
  const t = await getTranslations("Landing");
  return (
    <article id={id} className={cn(styles.card, "min-w-0 scroll-mt-24 rounded-2xl", className)}>
      <div className={styles.front}>{children}</div>
      {details && <details className={styles.disclosure}>
        <summary
          aria-label={`${t("featureDetails")}: ${title}`}
          className={cn(styles.toggle, "flex size-12 cursor-pointer items-center justify-center rounded-full border border-current/20 bg-white/20 transition-colors hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current dark:bg-black/10 dark:hover:bg-black/20")}
        >
          <Plus className="size-5 transition-transform duration-200 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className={styles.content} role="region" aria-label={title} tabIndex={0}>
          <div className="text-sm leading-relaxed">{details}</div>
        </div>
      </details>}
    </article>
  );
}
