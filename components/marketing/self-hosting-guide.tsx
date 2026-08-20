"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  Globe2,
  Laptop,
  Mail,
  Monitor,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { CopyButton } from "@/components/marketing/copy-button";
import { Github } from "@/components/git/provider-icons";

type Path = "local" | "team";
type SupabaseMode = "managed" | "full";
type ServerAccess = "private" | "public";
type OptionalFeature = "application-email" | "web-push" | "github" | "gitlab";

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
  manualInstallTitle: string;
  manualInstallBody: string;
  promptNeedsSetup: string;
  localPromptTemplate: string;
  localAutostartPrompt: string;
  localPromptClientOld: string;
  localPromptClientNew: string;
  localPromptStopOld: string;
  localPromptStopNew: string;
  teamPromptSimpleTemplate: string;
  teamPromptManagedMode: string;
  teamPromptFullMode: string;
  teamPromptManagedPreparation: string;
  teamPromptFullPreparation: string;
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
  macPrivateBody: string;
  downloadMacApp: string;
  macServerMenu: string;
  browserTitle: string;
  browserLocalBody: string;
  browserTeamBody: string;
  browserPrivateBody: string;
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
  accessQuestion: string;
  privateAccessTitle: string;
  privateAccessBody: string;
  privateAccessBadge: string;
  publicAccessTitle: string;
  publicAccessBody: string;
  serverIpLabel: string;
  serverIpHint: string;
  serverIpError: string;
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
  specsTitle: string;
  specsAvailable: string;
  specsMinimum: string;
  specsRecommended: string;
  specsLocalMinimum: string;
  specsLocalRecommended: string;
  specsCloudMinimum: string;
  specsCloudRecommended: string;
  specsFullMinimum: string;
  specsFullRecommended: string;
  specsStorageNote: string;
  specsSource: string;
  servicesQuestion: string;
  servicesBody: string;
  servicesExcluded: string;
  serviceEmailTitle: string;
  serviceEmailBody: string;
  serviceEmailSetup: string;
  servicePushTitle: string;
  servicePushBody: string;
  servicePushSetup: string;
  serviceGithubTitle: string;
  serviceGithubBody: string;
  serviceGithubSetup: string;
  serviceGitlabTitle: string;
  serviceGitlabBody: string;
  serviceGitlabSetup: string;
  selectedServicesTitle: string;
  selectedServicesBody: string;
  selectedServicesPrompt: string;
  serverRoutinesPrompt: string;
  privateSupabaseManagedNotice: string;
  privateSupabaseFullNotice: string;
  privateNetworkBoundary: string;
  privateFullNetworkBoundary: string;
  publicNetworkBoundary: string;
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
  emailUrlsTitle: string;
  emailCloudLocation: string;
  emailFullLocation: string;
  emailSiteUrlLabel: string;
  emailRedirectUrlLabel: string;
  emailSmtpTitle: string;
  emailSmtpCloudBody: string;
  emailSmtpFullBody: string;
  emailSmtpFields: string;
  emailRestartTitle: string;
  emailTemplatesTitle: string;
  emailTemplatesManagedBody: string;
  emailTemplatesFullBody: string;
  emailConfirmTitle: string;
  emailResetTitle: string;
  emailSubjectLabel: string;
  emailBodyLabel: string;
  emailReviewTemplate: string;
  emailVerifyTitle: string;
  emailVerifySignup: string;
  emailVerifyReset: string;
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
  operations: string;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

interface SelfHostingGuideEmailTemplates {
  confirmSignup: EmailTemplate;
  resetPassword: EmailTemplate;
}

interface SelfHostingGuideProps {
  copy: SelfHostingGuideCopy;
  links: GuideLinks;
  emailTemplates: SelfHostingGuideEmailTemplates;
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
        <pre className="max-h-96 min-w-0 overflow-auto font-mono text-xs leading-relaxed text-foreground">
          <code>{command}</code>
        </pre>
        <CopyButton text={command} label={copy.copy} copiedLabel={copy.copied} />
      </div>
    </div>
  );
}

function PromptCard({
  prompt,
  body,
  copy,
  disabled = false,
}: {
  prompt: string;
  body: string;
  copy: SelfHostingGuideCopy;
  disabled?: boolean;
}) {
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
          disabled={disabled}
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
      {disabled && <p className="mt-3 text-sm text-destructive" role="alert">{copy.promptNeedsSetup}</p>}
    </div>
  );
}

function ClientAccess({
  serverOrigin,
  signupUrl,
  local,
  privateNetwork = false,
  copy,
  downloadUrl,
}: {
  serverOrigin: string;
  signupUrl: string;
  local: boolean;
  privateNetwork?: boolean;
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
          {local ? copy.macLocalBody : privateNetwork ? copy.macPrivateBody : copy.macTeamBody}
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
          {local ? copy.browserLocalBody : privateNetwork ? copy.browserPrivateBody : copy.browserTeamBody}
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

function EmailTemplateCard({
  title,
  template,
  copy,
}: {
  title: string;
  template: EmailTemplate;
  copy: SelfHostingGuideCopy;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{copy.emailSubjectLabel}</p>
      <Command command={template.subject} copy={copy} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{copy.emailBodyLabel}</p>
        <CopyButton text={template.body} label={copy.copy} copiedLabel={copy.copied} />
      </div>
      <details className="mt-3 rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {copy.emailReviewTemplate}
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
          {template.body}
        </pre>
      </details>
    </div>
  );
}

function EmailConfiguration({
  serverOrigin,
  mode,
  templates,
  copy,
}: {
  serverOrigin: string;
  mode: SupabaseMode;
  templates: SelfHostingGuideEmailTemplates;
  copy: SelfHostingGuideCopy;
}) {
  const callbackUrl = `${serverOrigin}/auth/callback`;
  const smtpConfiguration = mode === "managed"
    ? copy.emailSmtpFields
    : `SMTP_ADMIN_EMAIL=accounts@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=replace-with-smtp-user
SMTP_PASS=replace-with-smtp-password
SMTP_SENDER_NAME=minddy`;

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-background p-4">
          <h4 className="text-sm font-medium">{copy.emailUrlsTitle}</h4>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "managed" ? copy.emailCloudLocation : copy.emailFullLocation}
          </p>
          <Command
            command={`${copy.emailSiteUrlLabel}=${serverOrigin}\n${copy.emailRedirectUrlLabel}=${callbackUrl}`}
            copy={copy}
          />
        </section>
        <section className="rounded-xl border border-border bg-background p-4">
          <h4 className="text-sm font-medium">{copy.emailSmtpTitle}</h4>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "managed" ? copy.emailSmtpCloudBody : copy.emailSmtpFullBody}
          </p>
          <Command command={smtpConfiguration} copy={copy} />
          {mode === "full" && <p className="mt-3 text-xs text-muted-foreground">{copy.emailRestartTitle}</p>}
          {mode === "full" && (
            <Command
              command={"docker compose --env-file deploy/self-hosted/.env \\\n  -f /srv/minddy/supabase/docker/docker-compose.yml \\\n  -f deploy/self-hosted/compose.full.yml up -d auth"}
              copy={copy}
            />
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-muted/20 p-4">
        <h4 className="text-sm font-medium">{copy.emailTemplatesTitle}</h4>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {mode === "managed" ? copy.emailTemplatesManagedBody : copy.emailTemplatesFullBody}
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <EmailTemplateCard title={copy.emailConfirmTitle} template={templates.confirmSignup} copy={copy} />
          <EmailTemplateCard title={copy.emailResetTitle} template={templates.resetPassword} copy={copy} />
        </div>
      </section>

      <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <h4 className="text-sm font-medium">{copy.emailVerifyTitle}</h4>
        <Checklist items={[copy.emailVerifySignup, copy.emailVerifyReset]} />
      </section>
    </div>
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

function isPrivateIpv4(value: string) {
  const parts = value.trim().split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254);
}

export function SelfHostingGuide({ copy, links, emailTemplates, repositoryUrl, releaseTag, pnpmVersion }: SelfHostingGuideProps) {
  const [path, setPath] = useState<Path | null>(null);
  const [serverAccess, setServerAccess] = useState<ServerAccess>("private");
  const [supabaseMode, setSupabaseMode] = useState<SupabaseMode>("managed");
  const [serverIp, setServerIp] = useState("");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [optionalFeatures, setOptionalFeatures] = useState<OptionalFeature[]>([]);
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
  const serverIpValid = isPrivateIpv4(serverIp);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const addressValid = serverAccess === "private" ? serverIpValid : domainValid;
  const host = serverAccess === "private"
    ? (serverIpValid ? serverIp.trim() : "192.168.1.50")
    : (domainValid ? enteredHost : "tickets.example.com");
  const adminEmail = emailValid ? email.trim() : "ops@example.com";
  const supabaseHost = `supabase.${host}`;
  const serverOrigin = `${serverAccess === "private" ? "http" : "https"}://${host}`;
  const signupUrl = `${serverOrigin}/signup`;
  const serverSetupValid = addressValid && emailValid;
  const localOrigin = "http://localhost:6463";
  const localSignupUrl = `${localOrigin}/signup`;
  const localInstall = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile\npnpm self-host:local`;
  const serverClone = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile`;
  const fetchSupabase = "node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase";
  const installServerBase = supabaseMode === "managed"
    ? `pnpm self-host:install -- --mode managed \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail}`
    : serverAccess === "private"
      ? `pnpm self-host:install -- --mode full \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail} \\\n  --supabase-dir /srv/minddy/supabase`
      : `pnpm self-host:install -- --mode full \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail} \\\n  --supabase-host ${supabaseHost} \\\n  --supabase-dir /srv/minddy/supabase`;
  const featureFlags = optionalFeatures.map((feature) => ` \\\n  --enable ${feature}`).join("");
  const installServer = `${installServerBase}${featureFlags}`;
  const doctor = supabaseMode === "managed"
    ? "pnpm self-host:doctor -- --mode managed"
    : "pnpm self-host:doctor -- --mode full --supabase-compose /srv/minddy/supabase/docker/docker-compose.yml";
  const networkSetup = serverAccess === "private"
    ? (supabaseMode === "full" ? copy.privateFullNetworkBoundary : copy.privateNetworkBoundary)
    : `${copy.publicNetworkBoundary}${supabaseMode === "full" ? ` ${copy.dnsSupabase}: ${supabaseHost} → ${copy.dnsTarget}.` : ""}`;
  const localPrompt = copy.localPromptTemplate
    .replaceAll("MINDDY_GUIDE_URL", links.guide)
    .replaceAll("MINDDY_REPOSITORY_URL", repositoryUrl)
    .replaceAll("MINDDY_RELEASE_TAG", releaseTag)
    .replaceAll("MINDDY_PNPM_VERSION", pnpmVersion)
    .replaceAll("MINDDY_LOCAL_ORIGIN", localOrigin)
    .replace(copy.localPromptClientOld, copy.localPromptClientNew)
    .replace(copy.localPromptStopOld, copy.localPromptStopNew)
    .replaceAll("MINDDY_DOWNLOAD_URL", links.download) + `\n\n${copy.localAutostartPrompt}`;
  const featureCatalog = [
    { id: "application-email" as const, title: copy.serviceEmailTitle, body: copy.serviceEmailBody, setup: copy.serviceEmailSetup, icon: Mail },
    { id: "web-push" as const, title: copy.servicePushTitle, body: copy.servicePushBody, setup: copy.servicePushSetup, icon: Bell },
    { id: "github" as const, title: copy.serviceGithubTitle, body: copy.serviceGithubBody, setup: copy.serviceGithubSetup, icon: Github },
    { id: "gitlab" as const, title: copy.serviceGitlabTitle, body: copy.serviceGitlabBody, setup: copy.serviceGitlabSetup, icon: GitBranch },
  ];
  const selectedFeatureCatalog = featureCatalog.filter(({ id }) => optionalFeatures.includes(id));
  const selectedFeaturesPrompt = selectedFeatureCatalog.length > 0
    ? `\n\n${copy.selectedServicesPrompt}\n${selectedFeatureCatalog.map(({ title, setup }) => `- ${title}: ${setup}`).join("\n")}`
    : "";
  const teamPrompt = copy.teamPromptSimpleTemplate
    .replaceAll("MINDDY_GUIDE_URL", links.guide)
    .replaceAll("MINDDY_REPOSITORY_URL", repositoryUrl)
    .replaceAll("MINDDY_RELEASE_TAG", releaseTag)
    .replaceAll("MINDDY_PNPM_VERSION", pnpmVersion)
    .replaceAll("MINDDY_DOMAIN", host)
    .replaceAll("MINDDY_APP_ORIGIN", serverOrigin)
    .replaceAll("MINDDY_ACCESS_MODE", serverAccess === "private" ? copy.privateAccessTitle : copy.publicAccessTitle)
    .replaceAll("MINDDY_NETWORK_SETUP", networkSetup)
    .replaceAll("MINDDY_ADMIN_EMAIL", adminEmail)
    .replaceAll("MINDDY_SUPABASE_MODE", supabaseMode === "managed" ? copy.teamPromptManagedMode : copy.teamPromptFullMode)
    .replaceAll("MINDDY_SUPABASE_PREPARATION", supabaseMode === "managed" ? copy.teamPromptManagedPreparation : copy.teamPromptFullPreparation)
    .replaceAll("MINDDY_APP_ORIGIN", serverOrigin)
    .replaceAll("MINDDY_INSTALL_COMMAND", installServer)
    .replaceAll("MINDDY_DOCTOR_COMMAND", doctor)
    .replaceAll("MINDDY_DOWNLOAD_URL", links.download) + selectedFeaturesPrompt + `\n\n${copy.serverRoutinesPrompt}`;

  const toggleFeature = (feature: OptionalFeature) => {
    setOptionalFeatures((current) => current.includes(feature)
      ? current.filter((item) => item !== feature)
      : [...current, feature]);
  };
  const specs = path === "local"
    ? [copy.specsLocalMinimum, copy.specsLocalRecommended]
    : supabaseMode === "full"
      ? [copy.specsFullMinimum, copy.specsFullRecommended]
      : [copy.specsCloudMinimum, copy.specsCloudRecommended];
  const specsCard = (
    <section className="mb-6 rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
      <h3 className="font-medium">{copy.specsTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{copy.specsAvailable}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4"><dt className="text-xs font-medium text-muted-foreground">{copy.specsMinimum}</dt><dd className="mt-1 text-sm font-medium">{specs[0]}</dd></div>
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4"><dt className="text-xs font-medium text-primary">{copy.specsRecommended}</dt><dd className="mt-1 text-sm font-medium">{specs[1]}</dd></div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.specsStorageNote} <a className="underline underline-offset-2" href="https://supabase.com/docs/guides/self-hosting/docker" target="_blank" rel="noopener noreferrer">{copy.specsSource}</a></p>
    </section>
  );

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
                {specsCard}
                <PromptCard prompt={localPrompt} body={copy.localAiInstallBody} copy={copy} />
                <details className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                  <summary className="cursor-pointer text-lg font-medium">{copy.manualInstallTitle}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.manualInstallBody}</p>
                  <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /><h3 className="font-medium">{copy.requirementsTitle}</h3></div>
                  <p className="mt-2 text-sm text-muted-foreground">{copy.requirementsReady}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {EXTERNAL_TOOLS.map(({ key, href }) => <ResourceLink key={key} href={href}>{copy[key]}</ResourceLink>)}
                  </div>
                  </div>
                  <ol className="mt-6 space-y-4">
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
                    <Command command="Ctrl+C" copy={copy} />
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
                </details>
              </div>
            ) : (
              <div>
                <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                  <p>{serverAccess === "private"
                    ? (supabaseMode === "full" ? copy.privateFullNetworkBoundary : copy.privateNetworkBoundary)
                    : copy.publicNetworkBoundary}</p>
                </div>

                <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                  <h3 className="text-xl font-semibold tracking-tight">{copy.setupTitle}</h3>
                  <fieldset className="mt-5">
                    <legend className="text-sm font-medium">{copy.accessQuestion}</legend>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {([
                        { access: "private" as const, title: copy.privateAccessTitle, body: copy.privateAccessBody, badge: copy.privateAccessBadge, icon: ShieldCheck },
                        { access: "public" as const, title: copy.publicAccessTitle, body: copy.publicAccessBody, badge: null, icon: Globe2 },
                      ]).map(({ access, title, body, badge, icon: Icon }) => (
                        <label key={access} className={cn("cursor-pointer rounded-xl border p-4 transition-colors", serverAccess === access ? "border-primary bg-primary/[0.04]" : "border-border hover:bg-muted/40")}>
                          <input
                            type="radio"
                            name="server-access"
                            value={access}
                            checked={serverAccess === access}
                            onChange={() => setServerAccess(access)}
                            className="sr-only"
                          />
                          <div className="flex items-start gap-3">
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{title}</span>
                                {badge && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>}
                              </div>
                              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium">
                      {serverAccess === "private" ? copy.serverIpLabel : copy.domainLabel}
                      {serverAccess === "private" ? (
                        <input value={serverIp} onChange={(event) => setServerIp(event.target.value)} inputMode="decimal" spellCheck={false} placeholder="192.168.1.50" aria-invalid={serverIp.length > 0 && !serverIpValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
                      ) : (
                        <input value={domain} onChange={(event) => setDomain(event.target.value)} inputMode="url" spellCheck={false} placeholder="tickets.example.com" aria-invalid={domain.length > 0 && !domainValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
                      )}
                      <span className="mt-1.5 block text-xs font-normal text-muted-foreground">{serverAccess === "private" ? copy.serverIpHint : copy.domainHint}</span>
                      {serverAccess === "private" && serverIp.length > 0 && !serverIpValid && <span className="mt-1 block text-xs font-normal text-destructive" role="alert">{copy.serverIpError}</span>}
                      {serverAccess === "public" && domain.length > 0 && !domainValid && <span className="mt-1 block text-xs font-normal text-destructive" role="alert">{copy.domainError}</span>}
                    </label>
                    <label className="text-sm font-medium">
                      {copy.emailLabel}
                      <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="ops@example.com" aria-invalid={email.length > 0 && !emailValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
                      <span className="mt-1.5 block text-xs font-normal text-muted-foreground">{copy.emailHint}</span>
                      {email.length > 0 && !emailValid && <span className="mt-1 block text-xs font-normal text-destructive" role="alert">{copy.emailError}</span>}
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
                    {serverAccess === "private" && (
                      <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                        {supabaseMode === "managed" ? copy.privateSupabaseManagedNotice : copy.privateSupabaseFullNotice}
                      </p>
                    )}
                    <p className="mt-3 text-sm text-muted-foreground">{supabaseMode === "managed" ? copy.managedNeed : copy.fullNeed}</p>
                  </fieldset>
                  <fieldset className="mt-6">
                    <legend className="text-sm font-medium">{copy.servicesQuestion}</legend>
                    <p className="mt-1 text-sm text-muted-foreground">{copy.servicesBody}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {featureCatalog.map(({ id, title, body, icon: Icon }) => (
                        <label key={id} className={cn("cursor-pointer rounded-xl border p-4 transition-colors", optionalFeatures.includes(id) ? "border-primary bg-primary/[0.04]" : "border-border hover:bg-muted/40")}>
                          <input type="checkbox" checked={optionalFeatures.includes(id)} onChange={() => toggleFeature(id)} className="sr-only" />
                          <div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div className="min-w-0 flex-1"><span className="font-medium">{title}</span><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p></div>{optionalFeatures.includes(id) && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" aria-hidden /></span>}</div>
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{copy.servicesExcluded}</p>
                  </fieldset>
                </div>

                {specsCard}
                <PromptCard prompt={teamPrompt} body={copy.teamAiInstallBody} copy={copy} disabled={!serverSetupValid} />

                <details className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                  <summary className="cursor-pointer text-lg font-medium">{copy.manualInstallTitle}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.manualInstallBody}</p>
                  <ol className="mt-6 space-y-4">
                  <Step number={1} title={copy.stepPrepareServerTitle} body={copy.stepPrepareServerBody}>
                    <Checklist items={serverAccess === "private"
                      ? [
                          copy.serverChecklistDocker,
                          supabaseMode === "full" ? copy.privateFullNetworkBoundary : copy.privateNetworkBoundary,
                          copy.serverChecklistSmtp,
                        ]
                      : [copy.serverChecklistDocker, copy.serverChecklistDns, copy.serverChecklistPorts, copy.serverChecklistSmtp]} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ResourceLink href="https://docs.docker.com/engine/install/">{copy.installDocker}</ResourceLink>
                      {supabaseMode === "managed" && <ResourceLink href="https://supabase.com/dashboard/projects">{copy.managedTitle}</ResourceLink>}
                    </div>
                    {serverAccess === "public" && <div className="mt-4 rounded-xl border border-border bg-background p-4">
                      <div className="flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-primary" aria-hidden />{copy.dnsTitle}</div>
                      <dl className="mt-3 space-y-2 font-mono text-xs">
                        <div className="flex flex-wrap justify-between gap-2"><dt>{copy.dnsApp}</dt><dd>{host} → {copy.dnsTarget}</dd></div>
                        {supabaseMode === "full" && <div className="flex flex-wrap justify-between gap-2"><dt>{copy.dnsSupabase}</dt><dd>{supabaseHost} → {copy.dnsTarget}</dd></div>}
                      </dl>
                    </div>}
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
                    {selectedFeatureCatalog.length > 0 && <div className="mt-4 rounded-xl border border-border bg-background p-4"><h4 className="text-sm font-medium">{copy.selectedServicesTitle}</h4><p className="mt-1 text-sm text-muted-foreground">{copy.selectedServicesBody}</p><Checklist items={selectedFeatureCatalog.map(({ title, setup }) => `${title}: ${setup}`)} /></div>}
                  </Step>
                  <Step number={supabaseMode === "full" ? 5 : 4} title={copy.stepEmailTitle} body={supabaseMode === "managed" ? copy.stepEmailManagedBody : copy.stepEmailFullBody}>
                    <EmailConfiguration serverOrigin={serverOrigin} mode={supabaseMode} templates={emailTemplates} copy={copy} />
                  </Step>
                  <Step number={supabaseMode === "full" ? 6 : 5} title={copy.stepVerifyServerTitle} body={copy.stepVerifyServerBody}>
                    <Command command={doctor} copy={copy} />
                    <Checklist items={serverAccess === "private"
                      ? [copy.doctorPass, copy.emailPass, copy.backupPass]
                      : [copy.doctorPass, copy.httpsPass, copy.emailPass, copy.backupPass]} />
                  </Step>
                  <Step number={supabaseMode === "full" ? 7 : 6} title={copy.stepSignupServerTitle} body={copy.stepSignupServerBody}>
                    <ClientAccess serverOrigin={serverOrigin} signupUrl={signupUrl} local={false} privateNetwork={serverAccess === "private"} copy={copy} downloadUrl={links.download} />
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
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
