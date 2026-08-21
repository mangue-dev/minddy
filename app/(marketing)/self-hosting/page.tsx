import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Server, ShieldCheck } from "lucide-react";
import packageJson from "@/package.json";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MINDDY_REPOSITORY_URL, SITE_URL } from "@/lib/site";
import { localizedHref } from "@/lib/locale-href";
import {
  readSelfHostingEmailTemplate,
  SELF_HOSTING_EMAIL_SUBJECTS,
} from "@/lib/self-hosting-email-templates";
import { Github } from "@/components/git/provider-icons";
import {
  SelfHostingGuide,
  type SelfHostingGuideCopy,
} from "@/components/marketing/self-hosting-guide";
import { Reveal, RevealHeading } from "@/components/marketing/reveal";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHosting", locale: (await getLocale()) as Locale });
}

export default async function SelfHostingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("SelfHosting");
  const tCommon = await getTranslations("Common");
  const guideUrl = `${SITE_URL}${localizedHref("/self-hosting", locale)}`;
  const releaseTag = `v${packageJson.version}`;
  const releaseBase = `${MINDDY_REPOSITORY_URL}/blob/${releaseTag}`;
  const [confirmSignupTemplate, resetPasswordTemplate] = await Promise.all([
    readSelfHostingEmailTemplate("confirm-signup"),
    readSelfHostingEmailTemplate("reset-password"),
  ]);
  const guideCopy = {
    continueLabel: tCommon("continue"),
    backLabel: tCommon("back"),
    chooserTitle: t("chooserTitle"),
    chooserBody: t("chooserBody"),
    recommended: t("recommended"),
    localTitle: t("localTitle"),
    localBody: t("localBody"),
    localTime: t("localTime"),
    localFactUsers: t("localFactUsers"),
    localFactNetwork: t("localFactNetwork"),
    localFactMemory: t("localFactMemory"),
    teamTitle: t("teamTitle"),
    teamBody: t("teamBody"),
    teamTime: t("teamTime"),
    teamFactUsers: t("teamFactUsers"),
    teamFactNetwork: t("teamFactNetwork"),
    teamFactMemory: t("teamFactMemory"),
    choosePath: t("choosePath"),
    changePath: t("changePath"),
    localGuideTitle: t("localGuideTitle"),
    localGuideBody: t("localGuideBody"),
    localBoundary: t("localBoundary"),
    aiInstallTitle: t("aiInstallTitle"),
    localAiInstallBody: t("localAiInstallBody"),
    teamAiInstallBody: t("teamAiInstallBody"),
    copyInstallPrompt: t("copyInstallPrompt"),
    reviewInstallPrompt: t("reviewInstallPrompt"),
    manualInstallTitle: t("manualInstallTitle"),
    manualInstallBody: t("manualInstallBody"),
    promptNeedsSetup: t("promptNeedsSetup"),
    localPromptTemplate: t.raw("localPromptTemplate") as string,
    localAutostartPrompt: t("localAutostartPrompt"),
    localPromptClientOld: t("localPromptClientOld"),
    localPromptClientNew: t("localPromptClientNew"),
    localPromptStopOld: t("localPromptStopOld"),
    localPromptStopNew: t("localPromptStopNew"),
    teamPromptSimpleTemplate: t.raw("teamPromptSimpleTemplate") as string,
    teamPromptManagedMode: t("teamPromptManagedMode"),
    teamPromptFullMode: t("teamPromptFullMode"),
    teamPromptManagedPreparation: t("teamPromptManagedPreparation"),
    teamPromptFullPreparation: t("teamPromptFullPreparation"),
    requirementsTitle: t("requirementsTitle"),
    requirementsReady: t("requirementsReady"),
    installNode: t("installNode"),
    installDocker: t("installDocker"),
    installSupabase: t("installSupabase"),
    installGit: t("installGit"),
    stepCheckToolsTitle: t("stepCheckToolsTitle"),
    stepCheckToolsBody: t("stepCheckToolsBody"),
    stepInstallLocalTitle: t("stepInstallLocalTitle"),
    stepInstallLocalBody: t("stepInstallLocalBody"),
    localOptimizationTitle: t("localOptimizationTitle"),
    localOptimizationBody: t("localOptimizationBody"),
    localOptimizationOne: t("localOptimizationOne"),
    localOptimizationTwo: t("localOptimizationTwo"),
    localOptimizationThree: t("localOptimizationThree"),
    stepOpenLocalTitle: t("stepOpenLocalTitle"),
    stepOpenLocalBody: t("stepOpenLocalBody"),
    openSignup: t("openSignup"),
    macAppTitle: t("macAppTitle"),
    macLocalBody: t("macLocalBody"),
    macTeamBody: t("macTeamBody"),
    macPrivateBody: t("macPrivateBody"),
    downloadMacApp: t("downloadMacApp"),
    macServerMenu: t("macServerMenu"),
    browserTitle: t("browserTitle"),
    browserLocalBody: t("browserLocalBody"),
    browserTeamBody: t("browserTeamBody"),
    browserPrivateBody: t("browserPrivateBody"),
    stepTestLocalTitle: t("stepTestLocalTitle"),
    stepTestLocalBody: t("stepTestLocalBody"),
    testAccount: t("testAccount"),
    testProject: t("testProject"),
    testAttachment: t("testAttachment"),
    localLaterTitle: t("localLaterTitle"),
    localStopLabel: t("localStopLabel"),
    localRestartLabel: t("localRestartLabel"),
    localTeamQuestion: t("localTeamQuestion"),
    localTeamAnswer: t("localTeamAnswer"),
    teamGuideTitle: t("teamGuideTitle"),
    teamGuideBody: t("teamGuideBody"),
    teamBoundary: t("teamBoundary"),
    setupTitle: t("setupTitle"),
    accessQuestion: t("accessQuestion"),
    privateAccessTitle: t("privateAccessTitle"),
    privateAccessBody: t("privateAccessBody"),
    privateAccessBadge: t("privateAccessBadge"),
    publicAccessTitle: t("publicAccessTitle"),
    publicAccessBody: t("publicAccessBody"),
    serverIpLabel: t("serverIpLabel"),
    serverIpHint: t("serverIpHint"),
    serverIpError: t("serverIpError"),
    domainLabel: t("domainLabel"),
    domainHint: t("domainHint"),
    domainError: t("domainError"),
    emailLabel: t("emailLabel"),
    emailHint: t("emailHint"),
    emailError: t("emailError"),
    supabaseQuestion: t("supabaseQuestion"),
    managedTitle: t("managedTitle"),
    managedBody: t("managedBody"),
    managedBadge: t("managedBadge"),
    fullTitle: t("fullTitle"),
    fullBody: t("fullBody"),
    fullBadge: t("fullBadge"),
    managedNeed: t("managedNeed"),
    fullNeed: t("fullNeed"),
    specsTitle: t("specsTitle"),
    specsAvailable: t("specsAvailable"),
    specsMinimum: t("specsMinimum"),
    specsRecommended: t("specsRecommended"),
    specsLocalMinimum: t("specsLocalMinimum"),
    specsLocalRecommended: t("specsLocalRecommended"),
    specsCloudMinimum: t("specsCloudMinimum"),
    specsCloudRecommended: t("specsCloudRecommended"),
    specsFullMinimum: t("specsFullMinimum"),
    specsFullRecommended: t("specsFullRecommended"),
    specsStorageNote: t("specsStorageNote"),
    specsSource: t("specsSource"),
    servicesQuestion: t("servicesQuestion"),
    servicesBody: t("servicesBody"),
    servicesExcluded: t("servicesExcluded"),
    serviceEmailTitle: t("serviceEmailTitle"),
    serviceEmailBody: t("serviceEmailBody"),
    serviceEmailSetup: t("serviceEmailSetup"),
    servicePushTitle: t("servicePushTitle"),
    servicePushBody: t("servicePushBody"),
    servicePushSetup: t("servicePushSetup"),
    selectedServicesTitle: t("selectedServicesTitle"),
    selectedServicesBody: t("selectedServicesBody"),
    selectedServicesPrompt: t("selectedServicesPrompt"),
    serverRoutinesPrompt: t("serverRoutinesPrompt"),
    privateSupabaseManagedNotice: t("privateSupabaseManagedNotice"),
    privateSupabaseFullNotice: t("privateSupabaseFullNotice"),
    privateNetworkBoundary: t("privateNetworkBoundary"),
    privateFullNetworkBoundary: t("privateFullNetworkBoundary"),
    publicNetworkBoundary: t("publicNetworkBoundary"),
    stepPrepareServerTitle: t("stepPrepareServerTitle"),
    stepPrepareServerBody: t("stepPrepareServerBody"),
    serverChecklistDocker: t("serverChecklistDocker"),
    serverChecklistDns: t("serverChecklistDns"),
    serverChecklistPorts: t("serverChecklistPorts"),
    serverChecklistSmtp: t("serverChecklistSmtp"),
    dnsTitle: t("dnsTitle"),
    dnsApp: t("dnsApp"),
    dnsSupabase: t("dnsSupabase"),
    dnsTarget: t("dnsTarget"),
    stepGetReleaseTitle: t("stepGetReleaseTitle"),
    stepGetReleaseBody: t("stepGetReleaseBody", { release: releaseTag }),
    openRelease: t("openRelease"),
    stepFetchSupabaseTitle: t("stepFetchSupabaseTitle"),
    stepFetchSupabaseBody: t("stepFetchSupabaseBody"),
    stepRunInstallerTitle: t("stepRunInstallerTitle"),
    stepRunInstallerBody: t("stepRunInstallerBody"),
    installerSafe: t("installerSafe"),
    stepEmailTitle: t("stepEmailTitle"),
    stepEmailManagedBody: t("stepEmailManagedBody"),
    stepEmailFullBody: t("stepEmailFullBody"),
    emailUrlsTitle: t("emailUrlsTitle"),
    emailCloudLocation: t("emailCloudLocation"),
    emailFullLocation: t("emailFullLocation"),
    emailSiteUrlLabel: t("emailSiteUrlLabel"),
    emailRedirectUrlLabel: t("emailRedirectUrlLabel"),
    emailSmtpTitle: t("emailSmtpTitle"),
    emailSmtpCloudBody: t("emailSmtpCloudBody"),
    emailSmtpFullBody: t("emailSmtpFullBody"),
    emailSmtpFields: t("emailSmtpFields"),
    emailRestartTitle: t("emailRestartTitle"),
    emailTemplatesTitle: t("emailTemplatesTitle"),
    emailTemplatesManagedBody: t("emailTemplatesManagedBody"),
    emailTemplatesFullBody: t("emailTemplatesFullBody"),
    emailConfirmTitle: t("emailConfirmTitle"),
    emailResetTitle: t("emailResetTitle"),
    emailSubjectLabel: t("emailSubjectLabel"),
    emailBodyLabel: t("emailBodyLabel"),
    emailReviewTemplate: t("emailReviewTemplate"),
    emailVerifyTitle: t("emailVerifyTitle"),
    emailVerifySignup: t("emailVerifySignup"),
    emailVerifyReset: t("emailVerifyReset"),
    stepVerifyServerTitle: t("stepVerifyServerTitle"),
    stepVerifyServerBody: t("stepVerifyServerBody"),
    doctorPass: t("doctorPass"),
    httpsPass: t("httpsPass"),
    emailPass: t("emailPass"),
    backupPass: t("backupPass"),
    stepSignupServerTitle: t("stepSignupServerTitle"),
    stepSignupServerBody: t("stepSignupServerBody"),
    serverAnswersTitle: t("serverAnswersTitle"),
    answerExposureQuestion: t("answerExposureQuestion"),
    answerExposure: t("answerExposure"),
    answerOptionalQuestion: t("answerOptionalQuestion"),
    answerOptional: t("answerOptional"),
    answerUpdatesQuestion: t("answerUpdatesQuestion"),
    answerUpdates: t("answerUpdates"),
    openOperationsGuide: t("openOperationsGuide"),
    copy: t("copy"),
    copied: t("copied"),
  } satisfies SelfHostingGuideCopy;

  return (
    <>
      <section id="top" className="overflow-hidden pt-24 pb-14 sm:pt-28 sm:pb-18">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal as="p" className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
            <Server className="h-3.5 w-3.5" aria-hidden />
            {t("eyebrow")}
          </Reveal>
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
            <div>
              <RevealHeading as="h1" className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl" text={t("heroTitle")} />
              <Reveal as="p" delay={0.14} className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">{t("heroSubtitle")}</Reveal>
              <Reveal delay={0.22} className="mt-7 flex flex-wrap gap-3">
                <a href="#choose-path" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  {t("heroCta")}<ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
                  <Github className="h-4 w-4" aria-hidden />{t("repositoryCta")}
                </a>
              </Reveal>
            </div>
            <Reveal delay={0.18} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden />{t("promiseTitle")}</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("promiseBody")}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {[t("promiseOne"), t("promiseTwo"), t("promiseThree")].map((item) => <li key={item} className="flex gap-2"><span className="text-primary">✓</span>{item}</li>)}
              </ul>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{t("howBoundary")}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <SelfHostingGuide
        copy={guideCopy}
        links={{
          guide: guideUrl,
          download: `${SITE_URL}${localizedHref("/download", locale)}`,
          release: `${MINDDY_REPOSITORY_URL}/releases/tag/${releaseTag}`,
          operations: `${releaseBase}/docs/self-hosting-operations.md`,
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

      <section className="border-y border-border bg-muted/20 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <header>
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{t("operationsTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("operationsSubtitle")}</p>
            </header>
            <a href={`${releaseBase}/docs/self-hosting-operations.md`} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background">
              {t("openOperationsGuide")}<ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

    </>
  );
}
