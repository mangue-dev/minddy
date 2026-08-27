import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import packageJson from "@/package.json";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { localizedHref } from "@/lib/locale-href";
import { MINDDY_REPOSITORY_URL, SITE_URL } from "@/lib/site";
import {
  readSelfHostingEmailTemplate,
  SELF_HOSTING_EMAIL_SUBJECTS,
} from "@/lib/self-hosting-email-templates";
import {
  SelfHostingInstallWizard,
  type SelfHostingInstallCopy,
} from "@/components/marketing/self-hosting-install-wizard";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHostingInstall", locale: (await getLocale()) as Locale,
  });
}

export default async function SelfHostingInstallPage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string | string[] }>;
}) {
  const locale = (await getLocale()) as Locale;
  const messages = await loadMessages(locale);
  const copy = messages.SelfHostingInstall as SelfHostingInstallCopy;
  const releaseTag = `v${packageJson.version}`;
  const [confirmSignupTemplate, resetPasswordTemplate] = await Promise.all([
    readSelfHostingEmailTemplate("confirm-signup"),
    readSelfHostingEmailTemplate("reset-password"),
  ]);
  const routeParam = (await searchParams).route;
  const initialPath =
    routeParam === "local" || routeParam === "team" ? routeParam : null;

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-muted/20">
      <SelfHostingInstallWizard
        copy={copy}
        guidePath={localizedHref("/self-hosting", locale)}
        initialPath={initialPath}
        links={{
          guide: `${SITE_URL}${localizedHref("/self-hosting/install", locale)}`,
          download: `${SITE_URL}${localizedHref("/download", locale)}`,
          release: `${MINDDY_REPOSITORY_URL}/releases/tag/${releaseTag}`,
          operations: `${MINDDY_REPOSITORY_URL}/blob/${releaseTag}/docs/self-hosting-operations.md`,
        }}
        emailTemplates={{
          confirmSignup: {
            subject: SELF_HOSTING_EMAIL_SUBJECTS["confirm-signup"],
            body: confirmSignupTemplate,
          },
          resetPassword: {
            subject: SELF_HOSTING_EMAIL_SUBJECTS["reset-password"],
            body: resetPasswordTemplate,
          },
        }}
        repositoryUrl={MINDDY_REPOSITORY_URL}
        releaseTag={releaseTag}
        pnpmVersion="10.28.0"
      />
    </div>
  );
}
