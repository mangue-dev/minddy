import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ServerUnavailableState } from "@/components/server-unavailable-state";
import { sanitizeBackendRetryPath } from "@/lib/backend-availability";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ServerUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ retry?: string | string[] }>;
}) {
  const [t, params] = await Promise.all([
    getTranslations("ServerUnavailable"),
    searchParams,
  ]);
  const rawRetry = Array.isArray(params.retry) ? params.retry[0] : params.retry;
  const retryHref = sanitizeBackendRetryPath(rawRetry);

  return (
    <ServerUnavailableState
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      retryHref={retryHref}
    />
  );
}
