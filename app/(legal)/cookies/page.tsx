import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import {
  CookieTable,
  Intro,
  LegalTitle,
  List,
  MailLink,
  P,
  Section,
} from "@/components/legal/prose";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "cookies", locale: (await getLocale()) as Locale });
}

export default async function CookiesPage() {
  const t = await getTranslations("Cookies");

  const headers = {
    name: t("thCookie"),
    purpose: t("thPurpose"),
    duration: t("thDuration"),
  };

  return (
    <>
      <LegalTitle title={t("title")} updated={t("lastUpdated")} />

      <Section title={t("whatTitle")}>
        <P>{t("whatText")}</P>
      </Section>

      <Section title={t("usedTitle")}>
        <div className="space-y-8">
          <CookieTable
            caption={t("essentialName")}
            badge={t("required")}
            badgeTone="required"
            description={t("essentialDesc")}
            headers={headers}
            rows={[
              {
                name: t("essentialCookie1Name"),
                purpose: t("essentialCookie1Purpose"),
                duration: t("essentialCookie1Duration"),
              },
              {
                name: t("essentialCookie2Name"),
                purpose: t("essentialCookie2Purpose"),
                duration: t("essentialCookie2Duration"),
              },
            ]}
          />

          <CookieTable
            caption={t("analyticName")}
            badge={t("optional")}
            badgeTone="optional"
            description={t("analyticDesc")}
            headers={headers}
            rows={[
              {
                name: t("analyticCookie1Name"),
                purpose: t("analyticCookie1Purpose"),
                duration: t("analyticCookie1Duration"),
              },
            ]}
          />

          {/* Pas de badge : le stockage local n'est pas soumis au consentement,
              c'est un état d'interface qui ne quitte pas l'appareil. */}
          <CookieTable
            caption={t("localStorageName")}
            description={t("localStorageDesc")}
            headers={{ ...headers, name: t("thKey") }}
            rows={[
              {
                name: t("localStorageKey1Name"),
                purpose: t("localStorageKey1Purpose"),
                duration: t("localStorageKey1Duration"),
              },
              {
                name: t("localStorageKey2Name"),
                purpose: t("localStorageKey2Purpose"),
                duration: t("localStorageKey2Duration"),
              },
              {
                name: t("localStorageKey3Name"),
                purpose: t("localStorageKey3Purpose"),
                duration: t("localStorageKey3Duration"),
              },
              {
                name: t("localStorageKey4Name"),
                purpose: t("localStorageKey4Purpose"),
                duration: t("localStorageKey4Duration"),
              },
              {
                name: t("localStorageKey5Name"),
                purpose: t("localStorageKey5Purpose"),
                duration: t("localStorageKey5Duration"),
              },
            ]}
          />
        </div>
      </Section>

      <Section title={t("noCookieTitle")}>
        <P>{t("noCookieText")}</P>
      </Section>

      <Section title={t("thirdPartyTitle")}>
        <P>{t("thirdPartyText")}</P>
      </Section>

      <Section title={t("preferencesTitle")}>
        <Intro>{t("preferencesText")}</Intro>
        <List>
          <li>{t("preferencesOption1")}</li>
          <li>{t("preferencesOption2")}</li>
          <li>
            {t.rich("preferencesOption3", {
              email: () => <MailLink address="hello@minddy.app" />,
            })}
          </li>
        </List>
        <P>{t("preferencesNote")}</P>
      </Section>
    </>
  );
}
