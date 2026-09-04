"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ServerUnavailableState } from "@/components/server-unavailable-state";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("ServerUnavailable");

  useEffect(() => {
    console.error("[app] Unhandled render error:", error);
  }, [error]);

  return (
    <ServerUnavailableState
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      onRetry={() => window.location.reload()}
    />
  );
}
