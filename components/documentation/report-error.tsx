"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Flag01Icon } from "@hugeicons/core-free-icons";
import { useAuthOptional } from "@/lib/auth-context";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { documentationPath } from "@/lib/documentation";
import type { DocumentationFeedbackContext } from "@/lib/documentation-feedback";

const ProductFeedbackDialog = dynamic(
  () => import("@/components/product-feedback-dialog").then(m => m.ProductFeedbackDialog),
  { ssr: false },
);
const REPORT_PARAMETER = "report-error";

/** Resume the report after login without exposing article metadata in the form. */
export function DocumentationErrorReport({ articleId, locale, label }: DocumentationFeedbackContext & { label: string }) {
  const auth = useAuthOptional();
  const { documentationFeedbackIntegrationEnabled } = useRuntimeConfig();
  const t = useTranslations("Documentation");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userId = auth?.user?.id;

  useEffect(() => {
    if (!userId || auth?.loading || !documentationFeedbackIntegrationEnabled) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(REPORT_PARAMETER) !== "1") return;
    setMounted(true);
    setOpen(true);
    url.searchParams.delete(REPORT_PARAMETER);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [userId, auth?.loading, documentationFeedbackIntegrationEnabled, articleId]);

  const loginHref = `/login?redirect=${encodeURIComponent(`${documentationPath(articleId, locale)}?${REPORT_PARAMETER}=1`)}`;
  return <div className="mt-6">
    {!documentationFeedbackIntegrationEnabled || auth?.loading ? <Button variant="outline" disabled>
      <HugeiconsIcon icon={Flag01Icon} className="size-4 shrink-0" aria-hidden />{label}
    </Button> : userId ? <Button variant="outline" onClick={() => { setMounted(true); setOpen(true); }}>
      <HugeiconsIcon icon={Flag01Icon} className="size-4 shrink-0" aria-hidden />{label}
    </Button> : <Button asChild variant="outline">
      <a href={loginHref} onClick={event => {
        const destination = new URL(window.location.href);
        destination.searchParams.set(REPORT_PARAMETER, "1");
        event.currentTarget.href = `/login?redirect=${encodeURIComponent(destination.pathname + destination.search + destination.hash)}`;
      }}>
        <HugeiconsIcon icon={Flag01Icon} className="size-4 shrink-0" aria-hidden />{label}
      </a>
    </Button>}
    {!documentationFeedbackIntegrationEnabled && <p className="mt-2 text-sm text-muted-foreground">{t("reportUnavailable")}</p>}
    {mounted && userId && <ProductFeedbackDialog key={`${articleId}:${locale}:${userId}`} open={open} onOpenChange={setOpen}
      source="documentation" documentationContext={{ articleId, locale }} />}
  </div>;
}
