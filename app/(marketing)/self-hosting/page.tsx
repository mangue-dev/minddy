import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Activity,
  ArrowRight,
  CircleAlert,
  CloudCog,
  Database,
  FileKey,
  FolderArchive,
  HardDrive,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MINDDY_REPOSITORY_URL } from "@/lib/site";
import { CopyButton } from "@/components/marketing/copy-button";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHosting", locale: (await getLocale()) as Locale });
}

const TOPOLOGY = [
  { key: "app", icon: Server },
  { key: "database", icon: Database },
  { key: "storage", icon: HardDrive },
  { key: "realtime", icon: Activity },
] as const;

const STEPS = ["prerequisites", "clone", "local", "remote", "verify"] as const;

const OPTIONAL = [
  { key: "ai", icon: Sparkles },
  { key: "git", icon: Terminal },
  { key: "email", icon: Mail },
  { key: "scheduler", icon: CloudCog },
  { key: "analytics", icon: Activity },
  { key: "billing", icon: FileKey },
] as const;

const OPERATIONS = [
  { key: "update", icon: RefreshCw },
  { key: "backup", icon: FolderArchive },
  { key: "restore", icon: HardDrive },
  { key: "diagnose", icon: CircleAlert },
] as const;

function Command({ command, copy, copied }: { command: string; copy: string; copied: string }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <pre className="min-w-0 overflow-x-auto font-mono text-xs leading-relaxed text-foreground">
          <code>{command}</code>
        </pre>
        <CopyButton text={command} label={copy} copiedLabel={copied} />
      </div>
    </div>
  );
}

export default async function SelfHostingPage() {
  const t = await getTranslations("SelfHosting");

  return (
    <>
      <section id="top" className="overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal
            as="p"
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground"
          >
            <Server className="h-3.5 w-3.5" />
            {t("eyebrow")}
          </Reveal>
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
            <div>
              <RevealHeading
                as="h1"
                className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
                text={t("heroTitle")}
              />
              <Reveal as="p" delay={0.14} className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
                {t("heroSubtitle")}
              </Reveal>
              <Reveal as="p" delay={0.22} className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("heroNote")}
              </Reveal>
              <Reveal delay={0.28} className="mt-7">
                <a
                  href={MINDDY_REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {t("repositoryCta")} <ArrowRight className="h-4 w-4" />
                </a>
              </Reveal>
            </div>
            <Reveal delay={0.18} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">{t("outcomeLabel")}</p>
              <p className="mt-2 text-xl font-semibold tracking-tight">{t("outcomeTitle")}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("outcomeBody")}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl" text={t("topologyTitle")} />
            <Reveal as="p" delay={0.12} className="leading-relaxed text-pretty text-muted-foreground">{t("topologySubtitle")}</Reveal>
          </header>
          <RevealGroup as="ul" step={0.07} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOPOLOGY.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="mb-5 h-5 w-5 text-primary" />
                <h2 className="font-medium">{t(`topology_${key}_title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`topology_${key}_body`)}</p>
              </li>
            ))}
          </RevealGroup>
          <Reveal className="mt-5 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-muted-foreground">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <p>{t("topologyWarning")}</p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl" text={t("stepsTitle")} />
            <Reveal as="p" delay={0.12} className="leading-relaxed text-pretty text-muted-foreground">{t("stepsSubtitle")}</Reveal>
          </header>
          <RevealGroup as="ol" step={0.08} className="space-y-4">
            {STEPS.map((key, index) => (
              <li key={key} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-lg font-medium tracking-tight">{t(`step_${key}_title`)}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`step_${key}_body`)}</p>
                  <Command command={t(`step_${key}_command`)} copy={t("copy")} copied={t("copied")} />
                  {key === "clone" && (
                    <p className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                      <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
                        {t("step_clone_repository")}
                      </a>{" "}
                      {t("step_clone_note")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl" text={t("optionalTitle")} />
            <Reveal as="p" delay={0.12} className="leading-relaxed text-pretty text-muted-foreground">{t("optionalSubtitle")}</Reveal>
          </header>
          <RevealGroup as="ul" step={0.07} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {OPTIONAL.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="mb-4 h-5 w-5 text-primary" />
                <h2 className="font-medium">{t(`optional_${key}_title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`optional_${key}_body`)}</p>
              </li>
            ))}
          </RevealGroup>
          <Reveal className="mt-5 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-5">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <h2 className="font-medium">{t("unsupportedTitle")}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("unsupportedBody")}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl" text={t("operationsTitle")} />
            <Reveal as="p" delay={0.12} className="leading-relaxed text-pretty text-muted-foreground">{t("operationsSubtitle")}</Reveal>
          </header>
          <RevealGroup as="ul" step={0.07} className="grid gap-4 sm:grid-cols-2">
            {OPERATIONS.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <Icon className="mb-4 h-5 w-5 text-primary" />
                <h2 className="font-medium">{t(`operation_${key}_title`)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`operation_${key}_body`)}</p>
              </li>
            ))}
          </RevealGroup>
          <Reveal delay={0.2} className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-muted-foreground">{t("runbookNote")}</p>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border py-14 sm:py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tighter">{t("finishTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("finishBody")}</p>
          </div>
          <a href="#top" className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
            {t("backToTop")} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </>
  );
}
