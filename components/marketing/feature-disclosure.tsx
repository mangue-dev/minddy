import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { FeatureDisclosureFrame } from "@/components/feature-disclosure";

/** Localize the shared native card disclosure for landing sections. */
export async function FeatureDisclosure(props: {
  id?: string;
  title: string;
  children: ReactNode;
  details?: ReactNode;
  className?: string;
}) {
  const t = await getTranslations("Landing");
  return <FeatureDisclosureFrame {...props} detailsLabel={t("featureDetails")} />;
}
