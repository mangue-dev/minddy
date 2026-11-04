import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RelayGithubConnect } from "@/components/settings/relay-github-connect";

/**
 * Claim interstitial for the managed forge relay: the user lands here after
 * clicking "Connect GitHub" on a relay-only instance. The component opens
 * the Cloud claim URL in a new tab and polls until the installation is bound.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RelayClaim");
  return { title: t("title") };
}

export default function RelayGithubConnectPage() {
  return <RelayGithubConnect />;
}
