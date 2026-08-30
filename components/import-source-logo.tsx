import {
  siGithub,
  siJira,
  siLinear,
  siNotion,
  siTrello,
} from "simple-icons";
import { FileUp } from "lucide-react";
import { cn } from "mangue-ui";
import type { ImportGuideId } from "@/lib/import-guides";
import { BrandLogo } from "@/components/brand-logo";

type SimpleIcon = {
  hex: string;
  path: string;
  title: string;
};

const IMPORT_SOURCE_MARKS: Partial<
  Record<ImportGuideId, { icon: SimpleIcon; monochrome?: boolean }>
> = {
  linear: { icon: siLinear },
  jira: { icon: siJira },
  notion: { icon: siNotion, monochrome: true },
  github: { icon: siGithub, monochrome: true },
  trello: { icon: siTrello },
};

const MINDDY_IMPORT_MARK = {
  logo: "/import/minddy-light.svg",
  logoDark: "/import/minddy-dark.svg",
};

/** Identifiable source mark for each supported CSV import path. */
export function ImportSourceLogo({
  source,
  size = 16,
  className,
}: {
  source: ImportGuideId | string;
  size?: number;
  className?: string;
}) {
  if (source === "minddy") {
    return (
      <span
        aria-hidden
        className={cn("inline-flex shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <BrandLogo brand={MINDDY_IMPORT_MARK} className="size-full" />
      </span>
    );
  }

  const mark = IMPORT_SOURCE_MARKS[source as ImportGuideId];
  if (!mark) {
    return (
      <FileUp
        aria-hidden
        className={cn("shrink-0 text-muted-foreground", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      className={cn(
        "shrink-0",
        mark.monochrome && "text-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <path
        d={mark.icon.path}
        fill={mark.monochrome ? "currentColor" : `#${mark.icon.hex}`}
      />
    </svg>
  );
}
