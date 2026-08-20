import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Database, HardDrive, Server, ShieldCheck } from "lucide-react";
import packageJson from "@/package.json";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MINDDY_REPOSITORY_URL, SITE_URL } from "@/lib/site";
import { localizedHref } from "@/lib/locale-href";
import { Github } from "@/components/git/provider-icons";
import {
  SelfHostingGuide,
  type SelfHostingGuideCopy,
} from "@/components/marketing/self-hosting-guide";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHosting", locale: (await getLocale()) as Locale });
}

const FOUNDATIONS = [
  { key: "app", icon: Server },
  { key: "supabase", icon: Database },
  { key: "data", icon: HardDrive },
] as const;

const OPERATIONS = ["backup", "update", "diagnose"] as const;

export default async function SelfHostingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("SelfHosting");
  const guideUrl = `${SITE_URL}${localizedHref("/self-hosting", locale)}`;
  const releaseTag = `v${packageJson.version}`;
  const releaseBase = `${MINDDY_REPOSITORY_URL}/blob/${releaseTag}`;
  const guideCopy = {
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
    localPromptTemplate: t.raw("localPromptTemplate") as string,
    teamPromptTemplate: t.raw("teamPromptTemplate") as string,
    teamPromptManagedMode: t("teamPromptManagedMode"),
    teamPromptFullMode: t("teamPromptFullMode"),
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
    downloadMacApp: t("downloadMacApp"),
    macServerMenu: t("macServerMenu"),
    browserTitle: t("browserTitle"),
    browserLocalBody: t("browserLocalBody"),
    browserTeamBody: t("browserTeamBody"),
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
    openAuthGuide: t("openAuthGuide"),
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
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="max-w-2xl">
            <RevealHeading className="text-2xl font-semibold tracking-tighter text-balance sm:text-3xl" text={t("howTitle")} />
            <Reveal as="p" delay={0.1} className="mt-3 leading-relaxed text-muted-foreground">{t("howBody")}</Reveal>
          </header>
          <RevealGroup as="ol" step={0.08} className="mt-8 grid gap-3 md:grid-cols-3">
            {FOUNDATIONS.map(({ key, icon: Icon }, index) => (
              <li key={key} className="relative rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary" aria-hidden /><span className="text-xs font-medium text-muted-foreground">0{index + 1}</span></div>
                <h2 className="mt-5 font-medium">{t(`foundation_${key}_title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`foundation_${key}_body`)}</p>
              </li>
            ))}
          </RevealGroup>
          <Reveal className="mt-4 flex gap-3 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><p>{t("howBoundary")}</p>
          </Reveal>
        </div>
      </section>

      <SelfHostingGuide
        copy={guideCopy}
        links={{
          guide: guideUrl,
          download: `${SITE_URL}${localizedHref("/download", locale)}`,
          release: `${MINDDY_REPOSITORY_URL}/releases/tag/${releaseTag}`,
          auth: `${releaseBase}/docs/auth-supabase-config.md`,
          operations: `${releaseBase}/docs/self-hosting-operations.md`,
        }}
        repositoryUrl={MINDDY_REPOSITORY_URL}
        releaseTag={releaseTag}
        pnpmVersion="10.28.0"
      />

      <section className="border-y border-border bg-muted/20 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{t("operationsTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("operationsSubtitle")}</p>
          </header>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {OPERATIONS.map((key) => (
              <a key={key} href={`${releaseBase}/docs/self-hosting-operations.md`} target="_blank" rel="noopener noreferrer" aria-label={t(`operation_${key}_title`)} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-background">
                <div className="flex items-center justify-between"><Github className="h-4 w-4 text-primary" aria-hidden /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden /></div>
                <h3 className="mt-4 font-medium">{t(`operation_${key}_title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`operation_${key}_body`)}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
