"use client";

import { useTranslations } from "next-intl";
import { MinddyLogo } from "@/components/minddy-logo";
import { ProviderLogo } from "@/components/model-logo";
import { MINDDY_CLOUD_PROVIDER } from "@/lib/ai-surfaces";
import type { AiProviderOption } from "@/lib/ai-provider-options";

/** A provider an account can choose (MIN-826): its logo and name, minddy Cloud included. */
export function ProviderOptionLabel({ option }: { option: Pick<AiProviderOption, "id" | "label"> }) {
  const t = useTranslations("Account");
  const minddy = option.id === MINDDY_CLOUD_PROVIDER;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {minddy ? <MinddyLogo className="size-4 shrink-0" /> : <ProviderLogo provider={option.id} size={16} />}
      <span className="truncate">{minddy ? t("aiProviderMinddy") : option.label}</span>
    </span>
  );
}
