"use client";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { useTranslations } from "next-intl";

/** A mail draft works without a Minddy or GitHub account and contains no user data. */
export function DocumentationErrorReport({ articleId, locale, revision, label }: {
  articleId: string; locale: string; revision: number; label: string;
}) {
  const { contactEmail } = useRuntimeConfig();
  const t = useTranslations("Documentation");
  const subject = encodeURIComponent(`Documentation: ${articleId} (${locale})`);
  const body = encodeURIComponent(`${t("articleLabel")}: ${articleId}\n${t("localeLabel")}: ${locale}\n${t("revisionLabel")}: ${revision}\n\n`);
  return <a href={`mailto:${contactEmail}?subject=${subject}&body=${body}`}
    className="mt-8 inline-block text-sm underline underline-offset-4">{label}</a>;
}
