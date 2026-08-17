import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import {
  LegalTitle,
  MailLink,
  P,
  Row,
  Rows,
  Section,
} from "@/components/legal/prose";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "legal", locale: (await getLocale()) as Locale });
}

export default async function LegalPage() {
  const t = await getTranslations("Legal");

  return (
    <>
      <LegalTitle title={t("title")} updated={t("lastUpdated")} />

      <Section title={t("editorTitle")}>
        <Rows>
          <Row label={t("tradeName")} value={SITE_NAME} />
          <Row label={t("responsible")} value="Clément Guérin" />
          <Row label={t("legalStatus")} value={t("legalStatusValue")} />
          <Row label={t("siret")} value="10028571700011" />
          <Row label={t("tva")} value={t("tvaValue")} />
          <Row label={t("address")} value="43 Quai Malakoff, 44000 Nantes, France" />
          <Row label={t("email")} value={CONTACT_EMAIL} />
        </Rows>
      </Section>

      <Section title={t("publicationDirectorTitle")}>
        <P>Clément Guérin</P>
      </Section>

      <Section title={t("hostTitle")}>
        <Rows>
          <Row label={t("company")} value="Vercel Inc." />
          <Row
            label={t("address")}
            value="440 N Barranca Ave #4133, Covina, CA 91723, USA"
          />
          <Row label={t("website")} value="vercel.com" />
        </Rows>
      </Section>

      <Section title={t("dataHostTitle")}>
        <P>{t("dataHostText")}</P>
      </Section>

      <Section title={t("ipTitle")}>
        <P>{t("ipText")}</P>
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
