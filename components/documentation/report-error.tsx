"use client";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";

/** A mail draft works without a Minddy or GitHub account and contains no user data. */
export function DocumentationErrorReport({ subject, body, label }: {
  subject: string; body: string; label: string;
}) {
  const { contactEmail } = useRuntimeConfig();
  return <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
    className="mt-8 inline-block text-sm underline underline-offset-4">{label}</a>;
}
