import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
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

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "privacy", locale: (await getLocale()) as Locale });
}

export default async function PrivacyPage() {
  const t = await getTranslations("Privacy");

  const collected = [
    { term: t("dataAccount"), desc: t("dataAccountDesc") },
    { term: t("dataContent"), desc: t("dataContentDesc") },
    { term: t("dataUsage"), desc: t("dataUsageDesc") },
    // MIN-296 — browser editor push service is a
    // full recipient (he receives the subscription address), and he
    // was not named anywhere. The content is illegible: the load
    // useful is encrypted with the device keys (RFC 8291).
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
        <TermList items={collected} />
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
        <TermList items={legalBases} />
      </Section>

      <Section title={t("retentionTitle")}>
        <TermList items={retention} />
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
        {/* MIN-119 — each return placed on a board goes through a model
 (moderation, categorization, translation), and a dictation adds
 the audio. Keeping it quiet was tantamount to not declaring a recipient, for people who don't even have an account with us. And these are the same
 suppliers as those in the next section: what we cannot
 guarantee there, we cannot guarantee here either. */}
        <P>{t("processorP3")}</P>
      </Section>

      <Section title={t("agentTitle")}>
        <P>{t("agentText")}</P>
      </Section>

      {/* MIN-119 — the final recipient is not OpenRouter but the
 provider of the selected model, and its retention policy varies.
 Saying “transmitted to OpenRouter” and stopping there named the gateway in
 leaving the recipient silent; Article 13 demands the opposite. We don't promise
 so nothing about this step — we describe it. */}
      <Section title={t("aiProvidersTitle")}>
        <P>{t("aiProvidersGateway")}</P>
        <P>{t("aiProvidersRetention")}</P>
        <P>{t("aiProvidersChoice")}</P>
      </Section>

      {/* Audience measurement (MIN-78). Dedicated section rather than a line in the
 data table: the collection has three regimes depending on the choice made
 on the banner, and "before any choice" is the case that no one
 ever explains even though it is the most common. */}
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

      {/* Self-service access and erasure (MIN-119). Section apart from the block
 “Your rights”: this one lists what the law grants, this one says
 where to click. The warning about owned projects is there in all
 letters — this is the consequence that "delete my account" does not leave
 guessing. */}
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
