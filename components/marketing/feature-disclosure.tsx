import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui/lib/utils";

/** Native disclosure keeps details accessible by keyboard and without JavaScript. */
export async function FeatureDisclosure({
  title,
  label,
  children,
  className,
}: {
  title: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = await getTranslations("Landing");

  return (
    <details className={cn("group/disclosure border-t border-current/15", className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>{label ?? t("featureDetails")}<span className="sr-only">: {title}</span></span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/20 transition-colors group-hover/disclosure:bg-current/5">
          <Plus className="size-4 transition-transform group-open/disclosure:rotate-45 motion-reduce:transition-none" aria-hidden />
        </span>
      </summary>
      <div className="pb-6 pt-2 text-sm leading-relaxed">{children}</div>
    </details>
  );
}
