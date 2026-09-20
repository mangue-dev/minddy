"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { captureClientException } from "@/lib/analytics";
import { ServerUnavailableState } from "@/components/server-unavailable-state";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("ServerUnavailable");

  useEffect(() => {
    console.error("[app] Unhandled render error:", error);
    // Error-boundary errors never reach the window-level exception
    // autocapture (React catches them), so report explicitly (MIN-542).
    captureClientException(error);
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
