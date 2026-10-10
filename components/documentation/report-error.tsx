"use client";
import { Button } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Flag01Icon } from "@hugeicons/core-free-icons";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";

/** A mail draft works without a Minddy or GitHub account and contains no user data. */
export function DocumentationErrorReport({ subject, body, label }: {
  subject: string; body: string; label: string;
}) {
  const { contactEmail } = useRuntimeConfig();
  return <div className="mt-6">
    <Button asChild variant="outline">
      <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
        <HugeiconsIcon icon={Flag01Icon} className="size-4 shrink-0" aria-hidden />
        {label}
      </a>
    </Button>
  </div>;
}
