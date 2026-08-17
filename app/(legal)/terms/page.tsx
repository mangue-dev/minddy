import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  Intro,
  LegalTitle,
  List,
  MailLink,
  P,
  Section,
} from "@/components/legal/prose";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "terms", locale: (await getLocale()) as Locale });
}

export default async function TermsPage() {
  const t = await getTranslations("Terms");

  return (
    <>
      <LegalTitle title={t("title")} updated={t("lastUpdated")} />

      <Section title={t("serviceTitle")}>
        <P>{t("serviceP1")}</P>
        <P>{t("serviceP2")}</P>
        <P>{t("serviceP3")}</P>
      </Section>

      <Section title={t("accessTitle")}>
        <List>
          <li>{t("accessI1")}</li>
          <li>{t("accessI2")}</li>
          <li>{t("accessI3")}</li>
        </List>
      </Section>

      <Section title={t("pricingTitle")}>
        <List>
          <li>{t("pricingI1")}</li>
          <li>{t("pricingI2")}</li>
          <li>{t("pricingI3")}</li>
          <li>{t("pricingI4")}</li>
          <li>{t("pricingI5")}</li>
        </List>
      </Section>

      <Section title={t("acceptableTitle")}>
        <Intro>{t("acceptableIntro")}</Intro>
        <List>
          <li>{t("acceptableI1")}</li>
          <li>{t("acceptableI2")}</li>
          <li>{t("acceptableI3")}</li>
          <li>{t("acceptableI4")}</li>
          <li>{t("acceptableI5")}</li>
        </List>
      </Section>

      <Section title={t("contentTitle")}>
        <P>{t("contentP1")}</P>
        <P>{t("contentP2")}</P>
      </Section>

      <Section title={t("aiTitle")}>
        <P>{t("aiP1")}</P>
        <P>{t("aiP2")}</P>
        <P>{t("aiP3")}</P>
      </Section>

      <Section title={t("feedbackTitle")}>
        <P>{t("feedbackP1")}</P>
        <P>{t("feedbackP2")}</P>
      </Section>

      <Section title={t("mcpTitle")}>
        <P>{t("mcpP1")}</P>
        <P>{t("mcpP2")}</P>
      </Section>

      <Section title={t("domainsTitle")}>
        <P>{t("domainsP1")}</P>
        <P>{t("domainsP2")}</P>
      </Section>

      <Section title={t("liabilityTitle")}>
        <P>{t("liabilityP1")}</P>
        <P>{t("liabilityP2")}</P>
      </Section>

      <Section title={t("ipTitle")}>
        <P>{t("ipP1")}</P>
        <P>{t("ipP2")}</P>
      </Section>

      <Section title={t("terminationTitle")}>
        <List>
          <li>{t("terminationI1")}</li>
          <li>{t("terminationI2")}</li>
          <li>{t("terminationI3")}</li>
        </List>
      </Section>

      <Section title={t("withdrawalTitle")}>
        <P>{t("withdrawalP1")}</P>
        <P>{t("withdrawalP2")}</P>
        <P>{t("withdrawalP3")}</P>
      </Section>

      <Section title={t("lawTitle")}>
        <P>{t("lawText")}</P>
      </Section>

      <Section title={t("contactTitle")}>
        <P>
          {t.rich("contactText", {
            email: () => <MailLink address={CONTACT_EMAIL} />,
          })}
        </P>
      </Section>
    </>
  );
}
