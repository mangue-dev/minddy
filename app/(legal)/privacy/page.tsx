import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
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
            email: () => <MailLink address="hello@minddy.app" />,
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
      </Section>

      <Section title={t("agentTitle")}>
        <P>{t("agentText")}</P>
      </Section>

      {/* MIN-119 — le destinataire final n'est pas OpenRouter mais le
          fournisseur du modèle retenu, et sa politique de conservation varie.
          Dire « transmis à OpenRouter » et s'arrêter là nommait la passerelle en
          taisant le destinataire ; l'article 13 demande l'inverse. On ne promet
          donc rien sur cette étape — on la décrit. */}
      <Section title={t("aiProvidersTitle")}>
        <P>{t("aiProvidersGateway")}</P>
        <P>{t("aiProvidersRetention")}</P>
        <P>{t("aiProvidersChoice")}</P>
      </Section>

      {/* Mesure d'audience (MIN-78). Section dédiée plutôt qu'une ligne dans le
          tableau des données : la collecte a trois régimes selon le choix fait
          sur le bandeau, et « avant tout choix » est le cas que personne
          n'explique jamais alors que c'est le plus fréquent. */}
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
            email: () => <MailLink address="hello@minddy.app" />,
            cnil: (c) => <ExternalLink href="https://www.cnil.fr">{c}</ExternalLink>,
          })}
        </P>
      </Section>

      {/* Accès et effacement en libre-service (MIN-119). Section à part du bloc
          « Vos droits » : celui-ci énumère ce que la loi accorde, celle-ci dit
          où cliquer. L'avertissement sur les projets possédés y est en toutes
          lettres — c'est la conséquence que « supprimer mon compte » ne laisse
          pas deviner. */}
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
