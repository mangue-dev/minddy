"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  Gauge,
  Globe2,
  Laptop,
  Monitor,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { CopyButton } from "@/components/marketing/copy-button";

type Path = "local" | "team";
type SupabaseMode = "managed" | "full";

export interface SelfHostingGuideCopy {
  chooserTitle: string;
  chooserBody: string;
  recommended: string;
  localTitle: string;
  localBody: string;
  localTime: string;
  localFactUsers: string;
  localFactNetwork: string;
  localFactMemory: string;
  teamTitle: string;
  teamBody: string;
  teamTime: string;
  teamFactUsers: string;
  teamFactNetwork: string;
  teamFactMemory: string;
  choosePath: string;
  changePath: string;
  localGuideTitle: string;
  localGuideBody: string;
  localBoundary: string;
  aiInstallTitle: string;
  localAiInstallBody: string;
  teamAiInstallBody: string;
  copyInstallPrompt: string;
  reviewInstallPrompt: string;
  localPromptTemplate: string;
  teamPromptTemplate: string;
  teamPromptManagedMode: string;
  teamPromptFullMode: string;
  requirementsTitle: string;
  requirementsReady: string;
  installNode: string;
  installDocker: string;
  installSupabase: string;
  installGit: string;
  stepCheckToolsTitle: string;
  stepCheckToolsBody: string;
  stepInstallLocalTitle: string;
  stepInstallLocalBody: string;
  localOptimizationTitle: string;
  localOptimizationBody: string;
  localOptimizationOne: string;
  localOptimizationTwo: string;
  localOptimizationThree: string;
  stepOpenLocalTitle: string;
  stepOpenLocalBody: string;
  openSignup: string;
  macAppTitle: string;
  macLocalBody: string;
  macTeamBody: string;
  downloadMacApp: string;
  macServerMenu: string;
  browserTitle: string;
  browserLocalBody: string;
  browserTeamBody: string;
  stepTestLocalTitle: string;
  stepTestLocalBody: string;
  testAccount: string;
  testProject: string;
  testAttachment: string;
  localLaterTitle: string;
  localStopLabel: string;
  localRestartLabel: string;
  localTeamQuestion: string;
  localTeamAnswer: string;
  teamGuideTitle: string;
  teamGuideBody: string;
  teamBoundary: string;
  setupTitle: string;
  domainLabel: string;
  domainHint: string;
  domainError: string;
  emailLabel: string;
  emailHint: string;
  emailError: string;
  supabaseQuestion: string;
  managedTitle: string;
  managedBody: string;
  managedBadge: string;
  fullTitle: string;
  fullBody: string;
  fullBadge: string;
  managedNeed: string;
  fullNeed: string;
  stepPrepareServerTitle: string;
  stepPrepareServerBody: string;
  serverChecklistDocker: string;
  serverChecklistDns: string;
  serverChecklistPorts: string;
  serverChecklistSmtp: string;
  dnsTitle: string;
  dnsApp: string;
  dnsSupabase: string;
  dnsTarget: string;
  stepGetReleaseTitle: string;
  stepGetReleaseBody: string;
  openRelease: string;
  stepFetchSupabaseTitle: string;
  stepFetchSupabaseBody: string;
  stepRunInstallerTitle: string;
  stepRunInstallerBody: string;
  installerSafe: string;
  stepEmailTitle: string;
  stepEmailManagedBody: string;
  stepEmailFullBody: string;
  openAuthGuide: string;
  stepVerifyServerTitle: string;
  stepVerifyServerBody: string;
  doctorPass: string;
  httpsPass: string;
  emailPass: string;
  backupPass: string;
  stepSignupServerTitle: string;
  stepSignupServerBody: string;
  serverAnswersTitle: string;
  answerExposureQuestion: string;
  answerExposure: string;
  answerOptionalQuestion: string;
  answerOptional: string;
  answerUpdatesQuestion: string;
  answerUpdates: string;
  openOperationsGuide: string;
  copy: string;
  copied: string;
}

interface GuideLinks {
  guide: string;
  download: string;
  release: string;
  auth: string;
  operations: string;
}

interface SelfHostingGuideProps {
  copy: SelfHostingGuideCopy;
  links: GuideLinks;
  repositoryUrl: string;
  releaseTag: string;
  pnpmVersion: string;
}

const EXTERNAL_TOOLS = [
  { key: "installNode", href: "https://nodejs.org/en/download" },
  { key: "installDocker", href: "https://docs.docker.com/get-started/get-docker/" },
  { key: "installSupabase", href: "https://supabase.com/docs/guides/local-development/cli/getting-started" },
  { key: "installGit", href: "https://git-scm.com/downloads" },
] as const;

function Command({ command, copy }: { command: string; copy: SelfHostingGuideCopy }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <pre className="min-w-0 overflow-x-auto font-mono text-xs leading-relaxed text-foreground">
          <code>{command}</code>
        </pre>
        <CopyButton text={command} label={copy.copy} copiedLabel={copy.copied} />
      </div>
    </div>
  );
}

function PromptCard({ prompt, body, copy }: { prompt: string; body: string; copy: SelfHostingGuideCopy }) {
  return (
    <div className="mb-8 rounded-2xl border border-primary/25 bg-primary/[0.05] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" aria-hidden />
            <h3 className="font-medium">{copy.aiInstallTitle}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <CopyButton
          text={prompt}
          label={copy.copyInstallPrompt}
          copiedLabel={copy.copied}
          className="h-10 justify-center rounded-full border-primary/30 px-4 text-sm text-foreground"
        />
      </div>
      <details className="mt-4 border-t border-primary/15 pt-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {copy.reviewInstallPrompt}
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {prompt}
        </pre>
      </details>
    </div>
  );
}

function ClientAccess({
  serverOrigin,
  signupUrl,
  local,
  copy,
  downloadUrl,
}: {
  serverOrigin: string;
  signupUrl: string;
  local: boolean;
  copy: SelfHostingGuideCopy;
  downloadUrl: string;
}) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Laptop className="h-4 w-4 text-primary" aria-hidden />
          {copy.macAppTitle}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {local ? copy.macLocalBody : copy.macTeamBody}
        </p>
        <p className="mt-3 rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
          {copy.macServerMenu} → {serverOrigin}
        </p>
        <ResourceLink href={downloadUrl}>{copy.downloadMacApp}</ResourceLink>
      </div>
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-primary" aria-hidden />
          {copy.browserTitle}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {local ? copy.browserLocalBody : copy.browserTeamBody}
        </p>
        <a href={signupUrl} target={local ? undefined : "_blank"} rel={local ? undefined : "noopener noreferrer"} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
          {copy.openSignup}<ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function Step({ number, title, body, children }: { number: number; title: string; body: string; children?: ReactNode }) {
  return (
    <li className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-medium tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        {children}
      </div>
    </li>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ResourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </a>
  );
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
}

function isHostname(value: string) {
  return /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/.test(value);
}

export function SelfHostingGuide({ copy, links, repositoryUrl, releaseTag, pnpmVersion }: SelfHostingGuideProps) {
  const [path, setPath] = useState<Path | null>(null);
  const [supabaseMode, setSupabaseMode] = useState<SupabaseMode>("managed");
  const [domain, setDomain] = useState("tickets.example.com");
  const [email, setEmail] = useState("ops@example.com");
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "local" || hash === "team") setPath(hash);
  }, []);

  const selectPath = (nextPath: Path) => {
    setPath(nextPath);
    window.history.replaceState(null, "", `#${nextPath}`);
    window.requestAnimationFrame(() => guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const clearPath = () => {
    setPath(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    document.getElementById("choose-path")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const enteredHost = normalizeHostname(domain);
  const domainValid = isHostname(enteredHost);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const host = domainValid ? enteredHost : "tickets.example.com";
  const adminEmail = emailValid ? email.trim() : "ops@example.com";
  const supabaseHost = `supabase.${host}`;
  const signupUrl = `https://${host}/signup`;
  const localOrigin = "http://localhost:6463";
  const localSignupUrl = `${localOrigin}/signup`;
  const localInstall = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile\npnpm self-host:local`;
  const serverClone = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile`;
  const fetchSupabase = "node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase";
  const installServer = supabaseMode === "managed"
    ? `pnpm self-host:install -- --mode managed \\\n  --domain ${host} \\\n  --admin-email ${adminEmail}`
    : `pnpm self-host:install -- --mode full \\\n  --domain ${host} \\\n  --admin-email ${adminEmail} \\\n  --supabase-host ${supabaseHost} \\\n  --supabase-dir /srv/minddy/supabase`;
  const doctor = supabaseMode === "managed"
    ? "pnpm self-host:doctor -- --mode managed"
    : "pnpm self-host:doctor -- --mode full --supabase-compose /srv/minddy/supabase/docker/docker-compose.yml";
  const localPrompt = copy.localPromptTemplate
    .replaceAll("MINDDY_GUIDE_URL", links.guide)
    .replaceAll("MINDDY_REPOSITORY_URL", repositoryUrl)
    .replaceAll("MINDDY_RELEASE_TAG", releaseTag)
    .replaceAll("MINDDY_PNPM_VERSION", pnpmVersion)
    .replaceAll("MINDDY_LOCAL_ORIGIN", localOrigin)
    .replaceAll("MINDDY_DOWNLOAD_URL", links.download);
  const teamPrompt = copy.teamPromptTemplate
    .replaceAll("MINDDY_GUIDE_URL", links.guide)
    .replaceAll("MINDDY_REPOSITORY_URL", repositoryUrl)
    .replaceAll("MINDDY_RELEASE_TAG", releaseTag)
    .replaceAll("MINDDY_PNPM_VERSION", pnpmVersion)
    .replaceAll("MINDDY_DOMAIN", host)
    .replaceAll("MINDDY_ADMIN_EMAIL", adminEmail)
    .replaceAll("MINDDY_SUPABASE_MODE", supabaseMode === "managed" ? copy.teamPromptManagedMode : copy.teamPromptFullMode)
    .replaceAll("MINDDY_DOWNLOAD_URL", links.download);

  return (
    <section id="choose-path" className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">{copy.chooserTitle}</h2>
          <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">{copy.chooserBody}</p>
        </header>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            aria-pressed={path === "local"}
            onClick={() => selectPath("local")}
            className={cn(
              "group rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-6",
              path === "local" ? "border-primary ring-1 ring-primary/20" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Laptop className="h-5 w-5" aria-hidden />
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{copy.recommended}</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{copy.localTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.localBody}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
              <span className="font-medium">{copy.localTime}</span>
              <span className="text-muted-foreground">{copy.localFactUsers}</span>
              <span className="text-muted-foreground">{copy.localFactNetwork}</span>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">
              {copy.choosePath}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>
          </button>

          <button
            type="button"
            aria-pressed={path === "team"}
            onClick={() => selectPath("team")}
            className={cn(
              "group rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-6",
              path === "team" ? "border-primary ring-1 ring-primary/20" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Server className="h-5 w-5" aria-hidden />
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">{copy.teamTime}</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{copy.teamTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.teamBody}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
              <span className="font-medium">{copy.teamFactUsers}</span>
              <span className="text-muted-foreground">{copy.teamFactNetwork}</span>
              <span className="text-muted-foreground">{copy.teamFactMemory}</span>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">
              {copy.choosePath}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>
          </button>
        </div>

        {path && (
          <div ref={guideRef} className="scroll-mt-24 pt-14">
            <div className="mb-8 flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  {path === "local" ? <Gauge className="h-4 w-4" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
                  {path === "local" ? copy.localFactMemory : copy.teamFactUsers}
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
                  {path === "local" ? copy.localGuideTitle : copy.teamGuideTitle}
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {path === "local" ? copy.localGuideBody : copy.teamGuideBody}
                </p>
              </div>
              <button type="button" onClick={clearPath} className="self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {copy.changePath}
              </button>
            </div>

            {path === "local" ? (
              <div>
                <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-muted-foreground">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  <p>{copy.localBoundary}</p>
                </div>
                <PromptCard prompt={localPrompt} body={copy.localAiInstallBody} copy={copy} />
                <div className="mb-8 rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /><h3 className="font-medium">{copy.requirementsTitle}</h3></div>
                  <p className="mt-2 text-sm text-muted-foreground">{copy.requirementsReady}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {EXTERNAL_TOOLS.map(({ key, href }) => <ResourceLink key={key} href={href}>{copy[key]}</ResourceLink>)}
                  </div>
                </div>
                <ol className="space-y-4">
                  <Step number={1} title={copy.stepCheckToolsTitle} body={copy.stepCheckToolsBody}>
                    <Command command={"node --version\ndocker --version\nsupabase --version\ngit --version"} copy={copy} />
                  </Step>
                  <Step number={2} title={copy.stepInstallLocalTitle} body={copy.stepInstallLocalBody}>
                    <Command command={localInstall} copy={copy} />
                    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium"><Gauge className="h-4 w-4 text-primary" aria-hidden />{copy.localOptimizationTitle}</div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.localOptimizationBody}</p>
                      <Checklist items={[copy.localOptimizationOne, copy.localOptimizationTwo, copy.localOptimizationThree]} />
                    </div>
                  </Step>
                  <Step number={3} title={copy.stepOpenLocalTitle} body={copy.stepOpenLocalBody}>
                    <ClientAccess serverOrigin={localOrigin} signupUrl={localSignupUrl} local copy={copy} downloadUrl={links.download} />
                  </Step>
                  <Step number={4} title={copy.stepTestLocalTitle} body={copy.stepTestLocalBody}>
                    <Checklist items={[copy.testAccount, copy.testProject, copy.testAttachment]} />
                  </Step>
                </ol>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-medium">{copy.localLaterTitle}</h3>
                    <p className="mt-4 text-xs font-medium text-muted-foreground">{copy.localStopLabel}</p>
                    <Command command="supabase stop" copy={copy} />
                    <p className="mt-4 text-xs font-medium text-muted-foreground">{copy.localRestartLabel}</p>
                    <Command command="pnpm self-host:local" copy={copy} />
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20 p-5">
                    <h3 className="font-medium">{copy.localTeamQuestion}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.localTeamAnswer}</p>
                    <button type="button" onClick={() => selectPath("team")} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {copy.teamTitle}<ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  <p>{copy.teamBoundary}</p>
                </div>

                <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                  <h3 className="text-xl font-semibold tracking-tight">{copy.setupTitle}</h3>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium">
                      {copy.domainLabel}
                      <input value={domain} onChange={(event) => setDomain(event.target.value)} inputMode="url" spellCheck={false} aria-invalid={!domainValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
                      <span className="mt-1.5 block text-xs font-normal text-muted-foreground">{copy.domainHint}</span>
                      {!domainValid && <span className="mt-1 block text-xs font-normal text-destructive" role="alert">{copy.domainError}</span>}
                    </label>
                    <label className="text-sm font-medium">
                      {copy.emailLabel}
                      <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" aria-invalid={!emailValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
                      <span className="mt-1.5 block text-xs font-normal text-muted-foreground">{copy.emailHint}</span>
                      {!emailValid && <span className="mt-1 block text-xs font-normal text-destructive" role="alert">{copy.emailError}</span>}
                    </label>
                  </div>
                  <fieldset className="mt-6">
                    <legend className="text-sm font-medium">{copy.supabaseQuestion}</legend>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {([
                        { mode: "managed" as const, title: copy.managedTitle, body: copy.managedBody, badge: copy.managedBadge, icon: Database },
                        { mode: "full" as const, title: copy.fullTitle, body: copy.fullBody, badge: copy.fullBadge, icon: Server },
                      ]).map(({ mode, title, body, badge, icon: Icon }) => (
                        <label key={mode} className={cn("cursor-pointer rounded-xl border p-4 transition-colors", supabaseMode === mode ? "border-primary bg-primary/[0.04]" : "border-border hover:bg-muted/40")}>
                          <input type="radio" name="supabase-mode" value={mode} checked={supabaseMode === mode} onChange={() => setSupabaseMode(mode)} className="sr-only" />
                          <div className="flex items-start gap-3">
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                            <div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{title}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span></div><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p></div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{supabaseMode === "managed" ? copy.managedNeed : copy.fullNeed}</p>
                  </fieldset>
                </div>

                <PromptCard prompt={teamPrompt} body={copy.teamAiInstallBody} copy={copy} />

                <ol className="space-y-4">
                  <Step number={1} title={copy.stepPrepareServerTitle} body={copy.stepPrepareServerBody}>
                    <Checklist items={[copy.serverChecklistDocker, copy.serverChecklistDns, copy.serverChecklistPorts, copy.serverChecklistSmtp]} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ResourceLink href="https://docs.docker.com/engine/install/">{copy.installDocker}</ResourceLink>
                      {supabaseMode === "managed" && <ResourceLink href="https://supabase.com/dashboard/projects">{copy.managedTitle}</ResourceLink>}
                    </div>
                    <div className="mt-4 rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-primary" aria-hidden />{copy.dnsTitle}</div>
                      <dl className="mt-3 space-y-2 font-mono text-xs">
                        <div className="flex flex-wrap justify-between gap-2"><dt>{copy.dnsApp}</dt><dd>{host} → {copy.dnsTarget}</dd></div>
                        {supabaseMode === "full" && <div className="flex flex-wrap justify-between gap-2"><dt>{copy.dnsSupabase}</dt><dd>{supabaseHost} → {copy.dnsTarget}</dd></div>}
                      </dl>
                    </div>
                  </Step>
                  <Step number={2} title={copy.stepGetReleaseTitle} body={copy.stepGetReleaseBody}>
                    <Command command={serverClone} copy={copy} />
                    <div className="mt-4"><ResourceLink href={links.release}>{copy.openRelease}</ResourceLink></div>
                  </Step>
                  {supabaseMode === "full" && (
                    <Step number={3} title={copy.stepFetchSupabaseTitle} body={copy.stepFetchSupabaseBody}>
                      <Command command={fetchSupabase} copy={copy} />
                    </Step>
                  )}
                  <Step number={supabaseMode === "full" ? 4 : 3} title={copy.stepRunInstallerTitle} body={copy.stepRunInstallerBody}>
                    <Command command={installServer} copy={copy} />
                    <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{copy.installerSafe}</p>
                  </Step>
                  <Step number={supabaseMode === "full" ? 5 : 4} title={copy.stepEmailTitle} body={supabaseMode === "managed" ? copy.stepEmailManagedBody : copy.stepEmailFullBody}>
                    <div className="mt-4 flex flex-wrap gap-2"><ResourceLink href={links.auth}>{copy.openAuthGuide}</ResourceLink></div>
                  </Step>
                  <Step number={supabaseMode === "full" ? 6 : 5} title={copy.stepVerifyServerTitle} body={copy.stepVerifyServerBody}>
                    <Command command={doctor} copy={copy} />
                    <Checklist items={[copy.doctorPass, copy.httpsPass, copy.emailPass, copy.backupPass]} />
                  </Step>
                  <Step number={supabaseMode === "full" ? 7 : 6} title={copy.stepSignupServerTitle} body={copy.stepSignupServerBody}>
                    <ClientAccess serverOrigin={`https://${host}`} signupUrl={signupUrl} local={false} copy={copy} downloadUrl={links.download} />
                  </Step>
                </ol>

                <div className="mt-8 rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
                  <h3 className="text-lg font-medium tracking-tight">{copy.serverAnswersTitle}</h3>
                  <div className="mt-4 divide-y divide-border">
                    {[
                      [copy.answerExposureQuestion, copy.answerExposure],
                      [copy.answerOptionalQuestion, copy.answerOptional],
                      [copy.answerUpdatesQuestion, copy.answerUpdates],
                    ].map(([question, answer]) => (
                      <details key={question} className="group py-4 first:pt-0 last:pb-0">
                        <summary className="cursor-pointer list-none pr-6 text-sm font-medium marker:hidden">{question}</summary>
                        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{answer}</p>
                      </details>
                    ))}
                  </div>
                  <div className="mt-5"><ResourceLink href={links.operations}>{copy.openOperationsGuide}</ResourceLink></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
