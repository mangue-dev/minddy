"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { captureClientException } from "@/lib/analytics";
import { ServerUnavailableState } from "@/components/server-unavailable-state";
import { crashDetail } from "@/lib/crash-detail";

/**
 * A render error, not an unreachable server (MIN-945): it used to borrow the
 * "Can't reach the server" screen, which sent the report toward the network.
 * The detail line names the error, so a screenshot is enough to trace it.
 */
export default function Error({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("AppCrash");

  useEffect(() => {
    console.error("[app] Unhandled render error:", error);
    // Error-boundary errors never reach the window-level exception
    // autocapture (React catches them), so report explicitly (MIN-542).
    captureClientException(error);
  }, [error]);

  return (
    <ServerUnavailableState
      icon={Alert01Icon}
      title={t("title")}
      description={t("description")}
      detail={crashDetail(error)}
      retryLabel={t("reload")}
      onRetry={() => window.location.reload()}
    />
  );
}
