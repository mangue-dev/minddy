import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Metadata-only layout: the page is a Client Component and can't export
// `metadata` itself, so this server layout supplies the localized <title>.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("home") };
}

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
