import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  ExternalLink,
  Intro,
  LegalTitle,
  List,
  MailLink,
  P,
  Section,
  TermList,
} from "@/components/legal/prose";

export async function PrivacyContent({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Privacy" });

  const collected = [
    { term: t("dataAccount"), desc: t("dataAccountDesc") },
    { term: t("dataContent"), desc: t("dataContentDesc") },
    { term: t("dataUsage"), desc: t("dataUsageDesc") },
    // MIN-296: the browser vendor's push service receives the subscription
    // address and must be listed as a recipient. It cannot read the payload,
    // which is encrypted with the subscribing device's keys (RFC 8291).
    { term: t("dataPush"), desc: t("dataPushDesc") },
    { term: t("dataAI"), desc: t("dataAIDesc") },
    { term: t("dataGit"), desc: t("dataGitDesc") },
    { term: t("dataKeys"), desc: t("dataKeysDesc") },
    { term: t("dataBilling"), desc: t("dataBillingDesc") },
    { term: t("dataFeedback"), desc: t("dataFeedbackDesc") },
  ];

  const legalBases = [
    { term: t("legalBasisContract"), desc: t("legalBasisContractDesc") },
    { term: t("legalBasisInterest"), desc: t("legalBasisInterestDesc") },
    { term: t("legalBasisConsent"), desc: t("legalBasisConsentDesc") },
    { term: t("legalBasisObligation"), desc: t("legalBasisObligationDesc") },
  ];

  const retention = [
    { term: t("retentionAccount"), desc: t("retentionAccountDesc") },
    { term: t("retentionContent"), desc: t("retentionContentDesc") },
    { term: t("retentionNotifications"), desc: t("retentionNotificationsDesc") },
    { term: t("retentionAgent"), desc: t("retentionAgentDesc") },
    { term: t("retentionFeedback"), desc: t("retentionFeedbackDesc") },
    { term: t("retentionAnalytics"), desc: t("retentionAnalyticsDesc") },
    { term: t("retentionBilling"), desc: t("retentionBillingDesc") },
  ];

  return (
    <>
      <LegalTitle title={t("title")} updated={t("lastUpdated")} />

      <Section title={t("controllerTitle")}>
        <P>
          {t.rich("controllerText", {
            name: (chunks) => <span className="font-medium">{chunks}</span>,
            email: () => <MailLink address={CONTACT_EMAIL} />,
          })}
        </P>
      </Section>

      <Section title={t("collectedTitle")}>
        <Intro>{t("collectedIntro")}</Intro>
        <TermList locale={locale} items={collected} />
      </Section>

      <Section title={t("purposesTitle")}>
        <List>
          <li>{t("purpose1")}</li>
          <li>{t("purpose2")}</li>
          <li>{t("purpose3")}</li>
          <li>{t("purpose4")}</li>
          <li>{t("purpose5")}</li>
        </List>
      </Section>

      <Section title={t("legalBasisTitle")}>
        <TermList locale={locale} items={legalBases} />
      </Section>

      <Section title={t("retentionTitle")}>
        <TermList locale={locale} items={retention} />
      </Section>

      <Section title={t("transfersTitle")}>
        <P>{t("transfersText")}</P>
        <P>
          {t.rich("transfersProcessors", {
            supabase: (c) => <ExternalLink href="https://supabase.com">{c}</ExternalLink>,
            vercel: (c) => <ExternalLink href="https://vercel.com">{c}</ExternalLink>,
            stripe: (c) => <ExternalLink href="https://stripe.com">{c}</ExternalLink>,
            openrouter: (c) => (
              <ExternalLink href="https://openrouter.ai">{c}</ExternalLink>
            ),
            posthog: (c) => <ExternalLink href="https://posthog.com">{c}</ExternalLink>,
            resend: (c) => <ExternalLink href="https://resend.com">{c}</ExternalLink>,
          })}
        </P>
        <P>{t("transfersAuth")}</P>
      </Section>

      <Section title={t("processorTitle")}>
        <P>{t("processorP1")}</P>
        <P>{t("processorP2")}</P>
        {/* MIN-119: public feedback is processed by AI providers for moderation,
            categorization, and translation; dictation also sends audio. Disclose
            these recipients even for participants without a Minddy account.
            The provider retention limits described below apply here too. */}
        <P>{t("processorP3")}</P>
      </Section>

      <Section title={t("agentTitle")}>
        <P>{t("agentText")}</P>
      </Section>

      {/* MIN-119: OpenRouter routes requests to the selected model's provider,
          whose retention policy may differ. Article 13 requires disclosing the
          recipient beyond the gateway. Describe this processing without making
          retention guarantees that Minddy cannot enforce. */}
      <Section title={t("aiProvidersTitle")}>
        <P>{t("aiProvidersGateway")}</P>
        <P>{t("aiProvidersRetention")}</P>
        <P>{t("aiProvidersChoice")}</P>
      </Section>

      {/* MIN-78: explain analytics in a dedicated section because collection
          differs before a consent choice, after acceptance, and after rejection.
          Include the initial state as well as the two explicit choices. */}
      <Section title={t("analyticsTitle")}>
        <Intro>{t("analyticsIntro")}</Intro>
        <P>{t("analyticsAnonymous")}</P>
        <P>{t("analyticsAccepted")}</P>
        <P>{t("analyticsDeclined")}</P>
        <P>{t("analyticsMinimization")}</P>
      </Section>

      <Section title={t("thirdPartyTitle")}>
        <P>{t("thirdPartyText")}</P>
      </Section>

      <Section title={t("rightsTitle")}>
        <Intro>{t("rightsIntro")}</Intro>
        <List>
          <li>{t("rightAccess")}</li>
          <li>{t("rightRectification")}</li>
          <li>{t("rightErasure")}</li>
          <li>{t("rightPortability")}</li>
          <li>{t("rightObjection")}</li>
          <li>{t("rightRestriction")}</li>
          <li>{t("rightComplaint")}</li>
        </List>
        <P>
          {t.rich("rightsContact", {
            email: () => <MailLink address={CONTACT_EMAIL} />,
            cnil: (c) => <ExternalLink href="https://www.cnil.fr">{c}</ExternalLink>,
          })}
        </P>
      </Section>

      {/* MIN-119: distinguish legal rights from the app controls for exercising
          them. State that account deletion also deletes owned projects so readers
          understand the consequences before using the deletion control. */}
      <Section title={t("selfServiceTitle")}>
        <Intro>{t("selfServiceIntro")}</Intro>
        <List>
          <li>{t("selfServiceExport")}</li>
          <li>{t("selfServiceDelete")}</li>
        </List>
        <P>{t("selfServiceWarning")}</P>
        <P>{t("selfServiceOther")}</P>
      </Section>

      <Section title={t("breachTitle")}>
        <P>{t("breachText")}</P>
      </Section>
    </>
  );
}
