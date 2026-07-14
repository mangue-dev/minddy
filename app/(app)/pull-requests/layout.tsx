import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("pullRequests") };
}

export default function PullRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
