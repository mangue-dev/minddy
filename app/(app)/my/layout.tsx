import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("GlobalBoard");
  return { title: t("myTitle") };
}

export default function MyIssuesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
