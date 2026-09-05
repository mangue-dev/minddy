"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  Globe2,
  HardDrive,
  Laptop,
  Mail,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { Messages } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui/components/ui/popover";
import { cn } from "mangue-ui/lib/utils";
import { McpAvatar } from "@/components/actor-avatars";
import { CopyButton } from "@/components/marketing/copy-button";
import { CARD_TONES } from "@/components/marketing/card-tones";

type Path = "local" | "team";
type SupabaseMode = "managed" | "full";
type ServerAccess = "private" | "public";
type InstallMethod = "agent" | "manual";
type OptionalFeature = "application-email" | "web-push";

export type SelfHostingInstallCopy = Omit<
  Messages["SelfHostingInstall"],
  "metaTitle" | "metaDescription"
>;

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

interface WizardEmailTemplates {
  confirmSignup: EmailTemplate;
  resetPassword: EmailTemplate;
}

interface SelfHostingInstallWizardProps {
  copy: SelfHostingInstallCopy;
  links: GuideLinks;
  guidePath: string;
  emailTemplates: WizardEmailTemplates;
  repositoryUrl: string;
  releaseTag: string;
  pnpmVersion: string;
  initialPath?: Path | null;
}

interface Step {
  id: string;
  title: string;
  body?: string;
  canContinue: boolean;
  continueLabel?: string;
  content: ReactNode;
}

function replaceTokens(template: string, values: Record<string, string>) {
  return template.replace(/MINDDY_[A-Z_]+/g, (token) => values[token] ?? token);
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

const PANEL = "min-w-0 rounded-2xl bg-[#f3f5ef] p-6 sm:p-8 dark:bg-[#202821]";
const HIGHLIGHT_PANEL = `min-w-0 rounded-2xl p-6 sm:p-8 ${CARD_TONES.sky}`;
const COPY_BUTTON = "min-h-11 w-fit justify-center rounded-full border-current/15 bg-background/70 px-4 text-current hover:bg-background hover:text-current disabled:cursor-not-allowed disabled:opacity-50";

function CommandBlock({
  command,
  copy,
}: {
  command: string;
  copy: SelfHostingInstallCopy;
}) {
  return (
    <div className="mt-4 flex min-w-0 flex-col items-start gap-4 rounded-xl bg-background/70 p-4">
      <pre tabIndex={0} role="region" aria-label={copy.copyContentLabel} className="max-h-96 w-full min-w-0 overflow-auto overscroll-contain rounded-sm font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <code>{command}</code>
      </pre>
      <CopyButton text={command} label={copy.copy} copiedLabel={copy.copied} className={COPY_BUTTON} />
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
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
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/75 px-4 py-2 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </a>
  );
}

function OptionCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  body,
  badge,
  tone = CARD_TONES.sage,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Laptop;
  title: string;
  body: string;
  badge?: string;
  tone?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group min-w-0 rounded-2xl border-2 p-6 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-7",
        tone,
        selected ? "border-current/60" : "border-transparent hover:border-current/20",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <Icon className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
        <div className="flex min-w-0 items-center gap-3">
          {badge && <span className="text-right text-xs font-medium opacity-75">{badge}</span>}
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", selected ? "border-current bg-background/70" : "border-current/25")} aria-hidden>
            {selected && <Check className="size-4" />}
          </span>
        </div>
      </div>
      <h3 className="mt-6 text-2xl leading-tight font-medium tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed opacity-80">{body}</p>
    </button>
  );
}

function CompletionNote({ copy, criterion }: { copy: SelfHostingInstallCopy; criterion: string }) {
  return (
    <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-medium">{copy.doneWhen}</span> {criterion}
    </p>
  );
}

function PromptCard({
  prompt,
  body,
  copy,
  disabled,
}: {
  prompt: string;
  body: string;
  copy: SelfHostingInstallCopy;
  disabled: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl p-6 sm:p-8", CARD_TONES.lavender)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center pl-1"
              role="img"
              aria-label="Claude Code, Codex, Cursor"
            >
              {["claude", "codex", "cursor"].map((agent, index) => (
                <McpAvatar
                  key={agent}
                  agent={agent}
                  className={cn(
                    "relative size-8 border-2 border-card shadow-sm",
                    index > 0 && "-ml-2",
                  )}
                  iconClassName="size-4"
                />
              ))}
            </span>
            <h3 className="text-xl font-medium tracking-tight">{copy.agentTitle}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <CopyButton
          text={prompt}
          label={copy.copyPrompt}
          copiedLabel={copy.copied}
          disabled={disabled}
          className={COPY_BUTTON}
        />
      </div>
      <Accordion type="single" collapsible className="mt-6 rounded-xl bg-background/50 px-4 motion-reduce:[&_[data-slot=accordion-content]]:animate-none">
        <AccordionItem value="installation-prompt">
          <AccordionTrigger className="min-h-11 items-center gap-4 py-4">{copy.reviewPrompt}</AccordionTrigger>
          <AccordionContent animated className="pb-4">
            <pre tabIndex={0} role="region" aria-label={copy.copyContentLabel} className="max-h-96 overflow-auto overscroll-contain whitespace-pre-wrap rounded-xl bg-background/70 p-4 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring">
              {prompt}
            </pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {disabled && <p className="mt-3 text-sm text-destructive" role="alert">{copy.promptNeedsSetup}</p>}
    </div>
  );
}

function EmailTemplateCard({
  title,
  template,
  copy,
}: {
  title: string;
  template: EmailTemplate;
  copy: SelfHostingInstallCopy;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{copy.emailSubjectLabel}</p>
      <CommandBlock command={template.subject} copy={copy} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{copy.emailBodyLabel}</p>
        <CopyButton text={template.body} label={copy.copy} copiedLabel={copy.copied} className={COPY_BUTTON} />
      </div>
      <details className="mt-3 rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{copy.emailReviewTemplate}</summary>
        <pre tabIndex={0} className="mt-3 max-h-80 overflow-auto overscroll-contain whitespace-pre-wrap font-mono text-xs leading-relaxed [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring">{template.body}</pre>
      </details>
    </div>
  );
}

function smtpFieldsFor(mode: SupabaseMode, copy: SelfHostingInstallCopy) {
  return mode === "managed"
    ? copy.emailSmtpFields
    : "SMTP_ADMIN_EMAIL=accounts@example.com\nSMTP_HOST=smtp.example.com\nSMTP_PORT=587\nSMTP_USER=replace-with-smtp-user\nSMTP_PASS=replace-with-smtp-password\nSMTP_SENDER_NAME=minddy";
}

function EmailConfiguration({
  serverOrigin,
  mode,
  templates,
  copy,
}: {
  serverOrigin: string;
  mode: SupabaseMode;
  templates: WizardEmailTemplates;
  copy: SelfHostingInstallCopy;
}) {
  const callbackUrl = `${serverOrigin}/auth/callback`;
  const smtpFields = smtpFieldsFor(mode, copy);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={PANEL}>
          <h3 className="font-medium">{copy.emailUrlsTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode === "managed" ? copy.emailCloudLocation : copy.emailFullLocation}</p>
          <CommandBlock command={`${copy.emailSiteUrlLabel}=${serverOrigin}\n${copy.emailRedirectUrlLabel}=${callbackUrl}`} copy={copy} />
        </section>
        <section className={PANEL}>
          <h3 className="font-medium">{copy.emailSmtpTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode === "managed" ? copy.emailSmtpCloudBody : copy.emailSmtpFullBody}</p>
          <CommandBlock command={smtpFields} copy={copy} />
          {mode === "full" && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.emailRestartTitle}</p>}
        </section>
      </div>
      <section className={PANEL}>
        <h3 className="font-medium">{copy.emailTemplatesTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode === "managed" ? copy.emailTemplatesManagedBody : copy.emailTemplatesFullBody}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <EmailTemplateCard title={copy.emailConfirmTitle} template={templates.confirmSignup} copy={copy} />
          <EmailTemplateCard title={copy.emailResetTitle} template={templates.resetPassword} copy={copy} />
        </div>
      </section>
    </div>
  );
}

function ClientAccess({
  serverOrigin,
  local,
  privateNetwork,
  copy,
}: {
  serverOrigin: string;
  local: boolean;
  privateNetwork?: boolean;
  copy: SelfHostingInstallCopy;
}) {
  const destinationTitle = local ? copy.desktopLocalPathTitle : copy.desktopServerPathTitle;
  const DestinationIcon = local ? FolderOpen : Server;

  return (
    <section className="space-y-4" aria-labelledby="desktop-source-title">
      <div className={HIGHLIGHT_PANEL}>
        <div className="flex items-start gap-3">
          <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 id="desktop-source-title" className="font-medium">{copy.desktopAppTitle}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.desktopAppBody}</p>
          </div>
        </div>

        <ol className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <li className="rounded-xl border border-border bg-background p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>1</span>
              <div>
                <h3 className="font-medium">{copy.desktopMenuStepTitle}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.desktopMenuStepBody}</p>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-hidden>
              <div className="flex items-center gap-4 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">minddy</span>
                <span>Edit</span>
                <span>View</span>
                <span>Window</span>
              </div>
              <div className="w-[min(100%,17rem)] border-r border-border py-1.5 text-xs">
                <div className="px-3 py-1.5 text-muted-foreground">Server: minddy Cloud</div>
                <div className="flex items-center justify-between bg-primary px-3 py-2 font-medium text-primary-foreground">
                  <span>Connect to a Server…</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </li>

          <li className="rounded-xl border border-border bg-background p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>2</span>
              <div>
                <h3 className="font-medium">{destinationTitle}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {local ? copy.desktopLocalBody : privateNetwork ? copy.desktopPrivateBody : copy.desktopTeamBody}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">{copy.desktopPickerTitle}</p>
              {local ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground">
                    <HardDrive className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{copy.desktopLocalAction}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                    <FolderOpen className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                    <span>{copy.desktopFolderExample}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">{copy.desktopServerAddressLabel}</p>
                    <div className="mt-1.5 rounded-lg border border-primary bg-background px-3 py-2.5 font-mono text-xs break-all text-foreground ring-2 ring-primary/15">{serverOrigin}</div>
                  </div>
                  <div className="flex justify-end">
                    <span className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{copy.desktopConnectAction}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <DestinationIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{local ? copy.desktopLocalChoiceNote : copy.desktopServerChoiceNote}</span>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

export function SelfHostingInstallWizard({
  copy,
  links,
  guidePath,
  emailTemplates,
  repositoryUrl,
  releaseTag,
  pnpmVersion,
  initialPath = null,
}: SelfHostingInstallWizardProps) {
  const [path, setPath] = useState<Path | null>(initialPath);
  const [migrate, setMigrate] = useState<boolean | null>(null);
  const [method, setMethod] = useState<InstallMethod | null>(null);
  const [serverAccess, setServerAccess] = useState<ServerAccess>("private");
  const [supabaseMode, setSupabaseMode] = useState<SupabaseMode>("managed");
  const [serverIp, setServerIp] = useState("");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [optionalFeatures, setOptionalFeatures] = useState<OptionalFeature[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [progressOpen, setProgressOpen] = useState(false);
  const progressStepRef = useRef<HTMLLIElement>(null);
  const navigatingFromProgress = useRef(false);

  const enteredHost = normalizeHostname(domain);
  const domainValid = isHostname(enteredHost);
  const serverIpValid = isPrivateIpv4(serverIp);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const addressValid = serverAccess === "private" ? serverIpValid : domainValid;
  const host = serverAccess === "private"
    ? (serverIpValid ? serverIp.trim() : "192.168.1.50")
    : (domainValid ? enteredHost : "tickets.example.com");
  const adminEmail = emailValid ? email.trim() : "ops@example.com";
  const serverOrigin = `${serverAccess === "private" ? "http" : "https"}://${host}`;
  const serverSetupValid = addressValid && emailValid;
  const localOrigin = "http://localhost:6463";

  const localInstall = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile`;
  const serverClone = `git clone --branch ${releaseTag} --depth 1 ${repositoryUrl}.git minddy\ncd minddy\ncorepack enable\ncorepack prepare pnpm@${pnpmVersion} --activate\npnpm install --frozen-lockfile`;
  const fetchSupabase = "node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase";
  const featureFlags = optionalFeatures.map((feature) => ` \\\n  --enable ${feature}`).join("");
  const installServer = supabaseMode === "managed"
    ? `pnpm self-host:install -- --mode managed \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail}${featureFlags}`
    : `${serverAccess === "public" ? `pnpm self-host:install -- --mode full \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail} \\\n  --supabase-host supabase.${host} \\\n  --supabase-dir /srv/minddy/supabase` : `pnpm self-host:install -- --mode full \\\n  --app-url ${serverOrigin} \\\n  --admin-email ${adminEmail} \\\n  --supabase-dir /srv/minddy/supabase`}${featureFlags}`;
  const doctor = supabaseMode === "managed"
    ? "pnpm self-host:doctor -- --mode managed"
    : "pnpm self-host:doctor -- --mode full --supabase-compose /srv/minddy/supabase/docker/docker-compose.yml";
  const networkSetup = serverAccess === "private"
    ? (supabaseMode === "full" ? copy.networkSetupFullPrivate : copy.networkSetupManagedPrivate)
    : `${copy.networkSetupPublic}${supabaseMode === "full" ? ` ${copy.dnsSupabase}: supabase.${host} → ${copy.dnsTarget}.` : ""}`;
  const promptGuide = `${links.guide}?route=${path ?? "local"}`;
  const transferPrompt = migrate
    ? `\n\n${copy.transferPromptTitle}\n- ${copy.transferPromptBefore}: ${copy.exportOne} ${copy.exportTwo}\n- ${copy.transferPromptAfter}: ${copy.importOne} ${copy.importTwo}`
    : "";
  const featureCatalog = [
    { id: "application-email" as const, title: copy.serviceEmailTitle, body: copy.serviceEmailBody, setup: copy.serviceEmailSetup, icon: Mail },
    { id: "web-push" as const, title: copy.servicePushTitle, body: copy.servicePushBody, setup: copy.servicePushSetup, icon: Bell },
  ];
  const selectedFeatures = featureCatalog.filter(({ id }) => optionalFeatures.includes(id));
  const selectedFeaturePrompt = selectedFeatures.length > 0
    ? `\n\n${copy.selectedServicesPrompt}\n${selectedFeatures.map(({ title, setup }) => `- ${title}: ${setup}`).join("\n")}`
    : "";
  const emailSetupPrompt = path === "team"
    ? `\n\n${copy.emailAgentInstruction}\n\n${copy.emailUrlsTitle}\n${supabaseMode === "managed" ? copy.emailCloudLocation : copy.emailFullLocation}\n${copy.emailSiteUrlLabel}=${serverOrigin}\n${copy.emailRedirectUrlLabel}=${serverOrigin}/auth/callback\n\n${copy.emailSmtpTitle}\n${supabaseMode === "managed" ? copy.emailSmtpCloudBody : copy.emailSmtpFullBody}\n${smtpFieldsFor(supabaseMode, copy)}${supabaseMode === "full" ? `\n${copy.emailRestartTitle}` : ""}\n\n${copy.emailTemplatesTitle}\n${supabaseMode === "managed" ? copy.emailTemplatesManagedBody : copy.emailTemplatesFullBody}\n\n${copy.emailConfirmTitle}\n${copy.emailSubjectLabel}: ${emailTemplates.confirmSignup.subject}\n${copy.emailBodyLabel}:\n${emailTemplates.confirmSignup.body}\n\n${copy.emailResetTitle}\n${copy.emailSubjectLabel}: ${emailTemplates.resetPassword.subject}\n${copy.emailBodyLabel}:\n${emailTemplates.resetPassword.body}`
    : "";

  const localPrompt = replaceTokens(copy.localPromptTemplate, {
    MINDDY_GUIDE_URL: promptGuide,
    MINDDY_REPOSITORY_URL: repositoryUrl,
    MINDDY_RELEASE_TAG: releaseTag,
    MINDDY_PNPM_VERSION: pnpmVersion,
    MINDDY_LOCAL_ORIGIN: localOrigin,
    MINDDY_DOWNLOAD_URL: links.download,
  });

  const teamPrompt = replaceTokens(copy.teamPromptTemplate, {
    MINDDY_GUIDE_URL: promptGuide,
    MINDDY_REPOSITORY_URL: repositoryUrl,
    MINDDY_RELEASE_TAG: releaseTag,
    MINDDY_PNPM_VERSION: pnpmVersion,
    MINDDY_ACCESS_MODE: serverAccess === "private" ? copy.privateAccessTitle : copy.publicAccessTitle,
    MINDDY_APP_ORIGIN: serverOrigin,
    MINDDY_ADMIN_EMAIL: adminEmail,
    MINDDY_SUPABASE_MODE: supabaseMode === "managed" ? copy.teamPromptManagedMode : copy.teamPromptFullMode,
    MINDDY_NETWORK_SETUP: networkSetup,
    MINDDY_DOWNLOAD_URL: links.download,
    MINDDY_SUPABASE_PREPARATION: supabaseMode === "managed" ? copy.teamPromptManagedPreparation.replaceAll("MINDDY_APP_ORIGIN", serverOrigin) : copy.teamPromptFullPreparation,
    MINDDY_INSTALL_COMMAND: installServer,
    MINDDY_DOCTOR_COMMAND: doctor,
  }) + emailSetupPrompt + selectedFeaturePrompt + `\n\n${copy.serverRoutinesPrompt}` + transferPrompt;
  const toggleFeature = (feature: OptionalFeature) => {
    setOptionalFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]);
  };

  const capacity = path === "local"
    ? [copy.specsLocalMinimum, copy.specsLocalRecommended]
    : supabaseMode === "full"
      ? [copy.specsFullMinimum, copy.specsFullRecommended]
      : [copy.specsCloudMinimum, copy.specsCloudRecommended];

  const selectPath = (nextPath: Path) => {
    setPath(nextPath);
    setMethod(null);
  };

  const stages: Step[] = [
    {
      id: "desktop-app",
      title: copy.desktopSetupTitle,
      body: copy.desktopSetupBody,
      canContinue: true,
      continueLabel: copy.confirmDesktop,
      content: (
        <div className={HIGHLIGHT_PANEL}>
          <div className="flex items-start gap-3">
            <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-medium">{copy.desktopSetupPlatformTitle}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.desktopSetupPlatformBody}</p>
            </div>
          </div>
          <div className="mt-4"><ResourceLink href={links.download}>{copy.downloadDesktopApp}</ResourceLink></div>
          <CompletionNote copy={copy} criterion={copy.desktopSetupDone} />
        </div>
      ),
    },
    {
      id: "route",
      title: copy.routeTitle,
      body: copy.routeBody,
      canContinue: path !== null,
      content: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OptionCard selected={path === "local"} onSelect={() => selectPath("local")} icon={HardDrive} title={copy.localTitle} body={copy.localBody} badge={copy.recommended} />
          <OptionCard tone={CARD_TONES.sky} selected={path === "team"} onSelect={() => selectPath("team")} icon={Server} title={copy.teamTitle} body={copy.teamBody} />
        </div>
      ),
    },
    {
      id: "migration-choice",
      title: copy.migrateTitle,
      body: copy.migrateBody,
      canContinue: migrate !== null,
      content: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OptionCard tone={CARD_TONES.lavender} selected={migrate === true} onSelect={() => setMigrate(true)} icon={Download} title={copy.migrateYes} body={copy.migrateYesHint} />
          <OptionCard tone={CARD_TONES.sky} selected={migrate === false} onSelect={() => setMigrate(false)} icon={ArrowRight} title={copy.migrateNo} body={copy.migrateNoHint} />
        </div>
      ),
    },
    ...(migrate ? [{
      id: "migration-export",
      title: copy.exportTitle,
      body: copy.exportGoal,
      canContinue: true,
      continueLabel: copy.confirmExport,
      content: (
        <div className={HIGHLIGHT_PANEL}>
          <p className="text-sm font-medium">{copy.exportHeading}</p>
          <Checklist items={[copy.exportOne, copy.exportTwo]} />
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {copy.exportNote}
          </p>
          <CompletionNote copy={copy} criterion={copy.exportDone} />
        </div>
      ),
    }] : []),
    {
      id: "capacity",
      title: path === "local" ? copy.capacityLocalTitle : copy.capacityTeamTitle,
      body: copy.capacityBody,
      canContinue: true,
      continueLabel: copy.confirmCapacity,
      content: (
        <div className={PANEL}>
          <h3 className="font-medium">{copy.specsTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.specsAvailable}</p>
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4"><dt className="text-xs font-medium text-muted-foreground">{copy.specsMinimum}</dt><dd className="mt-1 text-sm font-medium">{capacity[0]}</dd></div>
            <div className={cn("rounded-xl p-4", CARD_TONES.sky)}><dt className="text-xs font-medium text-primary">{copy.specsRecommended}</dt><dd className="mt-1 text-sm font-medium">{capacity[1]}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{copy.specsStorageNote}</p>
          <CompletionNote copy={copy} criterion={copy.capacityDone} />
        </div>
      ),
    },
    ...(path === "team" ? [
      {
        id: "team-access",
        title: copy.accessTitle,
        body: copy.accessBody,
        canContinue: serverSetupValid,
        content: (
          <div className={cn("space-y-5", PANEL)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <OptionCard selected={serverAccess === "private"} onSelect={() => setServerAccess("private")} icon={ShieldCheck} title={copy.privateAccessTitle} body={copy.privateAccessBody} badge={copy.privateAccessBadge} />
              <OptionCard tone={CARD_TONES.sky} selected={serverAccess === "public"} onSelect={() => setServerAccess("public")} icon={Globe2} title={copy.publicAccessTitle} body={copy.publicAccessBody} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                {serverAccess === "private" ? copy.serverIpLabel : copy.domainLabel}
                <input value={serverAccess === "private" ? serverIp : domain} onChange={(event) => serverAccess === "private" ? setServerIp(event.target.value) : setDomain(event.target.value)} inputMode={serverAccess === "private" ? "decimal" : "url"} spellCheck={false} placeholder={serverAccess === "private" ? "192.168.1.50" : "tickets.example.com"} aria-invalid={serverAccess === "private" ? serverIp.length > 0 && !serverIpValid : domain.length > 0 && !domainValid} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none transition-shadow focus:ring-2 focus:ring-ring" />
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
          </div>
        ),
      },
      {
        id: "team-backend",
        title: copy.backendTitle,
        body: copy.backendBody,
        canContinue: true,
        content: (
          <div className={cn("space-y-5", PANEL)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <OptionCard selected={supabaseMode === "managed"} onSelect={() => setSupabaseMode("managed")} icon={Database} title={copy.managedTitle} body={copy.managedBody} badge={copy.managedBadge} />
              <OptionCard tone={CARD_TONES.lavender} selected={supabaseMode === "full"} onSelect={() => setSupabaseMode("full")} icon={Server} title={copy.fullTitle} body={copy.fullBody} badge={copy.fullBadge} />
            </div>
            <p className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">{supabaseMode === "managed" && serverAccess === "private" ? copy.privateSupabaseManagedNotice : supabaseMode === "full" && serverAccess === "private" ? copy.privateSupabaseFullNotice : supabaseMode === "managed" ? copy.managedNeed : copy.fullNeed}</p>
            <div>
              <h3 className="font-medium">{copy.featuresTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.featuresBody}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {featureCatalog.map(({ id, title, body, icon: Icon }) => (
                  <button key={id} type="button" aria-pressed={optionalFeatures.includes(id)} onClick={() => toggleFeature(id)} className={cn("min-h-11 rounded-xl border-2 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", optionalFeatures.includes(id) ? "border-current/60 bg-background/75" : "border-transparent bg-background/40 hover:bg-background/60")}>
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span><span className="font-medium">{title}</span><span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{body}</span></span>
                      {optionalFeatures.includes(id) && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.servicesExcluded}</p>
            </div>
          </div>
        ),
      },
    ] : []),
    {
      id: "method",
      title: copy.methodTitle,
      body: copy.methodBody,
      canContinue: method !== null,
      content: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OptionCard tone={CARD_TONES.lavender} selected={method === "agent"} onSelect={() => setMethod("agent")} icon={Bot} title={copy.methodAgentTitle} body={copy.methodAgentBody} badge={copy.methodAgentBadge} />
          <OptionCard tone={CARD_TONES.peach} selected={method === "manual"} onSelect={() => setMethod("manual")} icon={TerminalSquare} title={copy.methodManualTitle} body={copy.methodManualBody} badge={copy.methodManualBadge} />
        </div>
      ),
    },
    ...(method === "agent" ? [{
      id: "agent",
      title: copy.agentTitle,
      body: path === "local" ? copy.agentLocalGoal : copy.agentTeamGoal,
      canContinue: true,
      continueLabel: copy.confirmAgent,
      content: (
        <div>
          <PromptCard prompt={path === "local" ? `${localPrompt}\n\n${copy.localAutostartPrompt}${transferPrompt}` : teamPrompt} body={path === "local" ? copy.agentLocalRun : copy.agentTeamRun} copy={copy} disabled={path === "team" && !serverSetupValid} />
          <CompletionNote copy={copy} criterion={path === "local" ? copy.agentLocalDone : copy.agentTeamDone} />
        </div>
      ),
    }] : []),
    ...(method === "manual" && path === "local" ? [
      {
        id: "local-tools",
        title: copy.toolsTitle,
        body: copy.toolsBody,
        canContinue: true,
        continueLabel: copy.confirmTools,
        content: (
          <div className={PANEL}>
            <div className="flex flex-wrap gap-2">
              <ResourceLink href="https://nodejs.org/en/download">{copy.installNode}</ResourceLink>
              <ResourceLink href="https://docs.docker.com/get-started/get-docker/">{copy.installDocker}</ResourceLink>
              <ResourceLink href="https://supabase.com/docs/guides/local-development/cli/getting-started">{copy.installSupabase}</ResourceLink>
              <ResourceLink href="https://git-scm.com/downloads">{copy.installGit}</ResourceLink>
            </div>
            <CommandBlock command="node --version\ngit --version\ndocker --version\ndocker compose version\ndocker info\nsupabase --version" copy={copy} />
            <CompletionNote copy={copy} criterion={copy.toolsDone} />
          </div>
        ),
      },
      {
        id: "local-install",
        title: copy.manualLocalTitle,
        body: copy.manualLocalBody,
        canContinue: true,
        continueLabel: copy.confirmLocalInstall,
        content: (
          <div className={HIGHLIGHT_PANEL}>
            <CommandBlock command={localInstall} copy={copy} />
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{copy.minimalNote}</p>
            <CompletionNote copy={copy} criterion={copy.manualLocalDone} />
          </div>
        ),
      },
    ] : []),
    ...(method === "manual" && path === "team" ? [
      {
        id: "team-prepare",
        title: copy.prepareTitle,
        body: copy.prepareBody,
        canContinue: true,
        continueLabel: copy.confirmPrepare,
        content: (
          <div className={cn("space-y-5", PANEL)}>
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />{networkSetup}</p>
            <Checklist items={serverAccess === "private" ? [copy.serverChecklistDocker, networkSetup, copy.serverChecklistSmtp] : [copy.serverChecklistDocker, copy.serverChecklistDns, copy.serverChecklistPorts, copy.serverChecklistSmtp]} />
            {serverAccess === "public" && <div className="rounded-xl border border-border bg-background p-4"><div className="flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-primary" aria-hidden />{copy.dnsTitle}</div><dl className="mt-3 space-y-2 font-mono text-xs"><div className="flex flex-wrap justify-between gap-3"><dt>{copy.dnsApp}</dt><dd className="[overflow-wrap:anywhere]">{host} → {copy.dnsTarget}</dd></div>{supabaseMode === "full" && <div className="flex flex-wrap justify-between gap-3"><dt>{copy.dnsSupabase}</dt><dd className="[overflow-wrap:anywhere]">supabase.{host} → {copy.dnsTarget}</dd></div>}</dl></div>}
            <CompletionNote copy={copy} criterion={copy.prepareDone} />
          </div>
        ),
      },
      {
        id: "team-release",
        title: copy.releaseTitle,
        body: copy.releaseBody.replace("{release}", releaseTag),
        canContinue: true,
        continueLabel: copy.confirmRelease,
        content: (
          <div className={PANEL}><CommandBlock command={serverClone} copy={copy} /><div className="mt-4"><ResourceLink href={links.release}>{copy.openRelease}</ResourceLink></div><CompletionNote copy={copy} criterion={copy.releaseDone} /></div>
        ),
      },
      ...(supabaseMode === "full" ? [{
        id: "team-fetch",
        title: copy.fetchSupabaseTitle,
        body: copy.fetchSupabaseBody,
        canContinue: true,
        continueLabel: copy.confirmFetch,
        content: <div className={PANEL}><CommandBlock command={fetchSupabase} copy={copy} /><CompletionNote copy={copy} criterion={copy.fetchDone} /></div>,
      }] : []),
      {
        id: "team-installer",
        title: copy.installerTitle,
        body: copy.installerBody,
        canContinue: true,
        continueLabel: copy.confirmInstaller,
        content: (
          <div className={HIGHLIGHT_PANEL}><CommandBlock command={installServer} copy={copy} /><p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{copy.installerSafe}</p>{selectedFeatures.length > 0 && <div className="mt-4 rounded-xl border border-border bg-background p-4"><p className="text-sm font-medium">{copy.selectedServicesPrompt}</p><Checklist items={selectedFeatures.map(({ title, setup }) => `${title}: ${setup}`)} /></div>}<CompletionNote copy={copy} criterion={copy.installerDone} /></div>
        ),
      },
    ] : []),
    ...(path === "team" && method === "manual" ? [{
      id: "team-email",
      title: copy.emailTitle,
      body: supabaseMode === "managed" ? copy.emailManagedBody : copy.emailFullBody,
      canContinue: true,
      continueLabel: copy.confirmEmail,
      content: <div><EmailConfiguration serverOrigin={serverOrigin} mode={supabaseMode} templates={emailTemplates} copy={copy} /><CompletionNote copy={copy} criterion={copy.emailDone} /></div>,
    }] : []),
    ...(path === "local" && migrate === false ? [{
      id: "local-verify",
      title: copy.verifyLocalTitle,
      body: copy.verifyLocalBody,
      canContinue: true,
      continueLabel: copy.confirmChecks,
      content: (
        <div className="space-y-5">
          <ClientAccess serverOrigin={localOrigin} local copy={copy} />
          <div className={HIGHLIGHT_PANEL}>
            <Checklist items={[copy.testAccount, copy.testProject, copy.testAttachment]} />
            <CompletionNote copy={copy} criterion={copy.verifyLocalDone} />
          </div>
        </div>
      ),
    }] : []),
    ...(path === "team" ? [{
      id: "team-verify",
      title: copy.verifyTeamTitle,
      body: copy.verifyTeamBody,
      canContinue: true,
      continueLabel: copy.confirmChecks,
      content: <div className={HIGHLIGHT_PANEL}><CommandBlock command={doctor} copy={copy} /><Checklist items={serverAccess === "private" ? [copy.doctorPass, copy.emailPass, copy.backupPass] : [copy.doctorPass, copy.httpsPass, copy.emailPass, copy.backupPass]} /><CompletionNote copy={copy} criterion={copy.verifyTeamDone} /></div>,
    }] : []),
    ...(path === "team" && migrate === false ? [{
      id: "team-open",
      title: copy.openTeamTitle,
      body: copy.openTeamBody,
      canContinue: true,
      continueLabel: copy.confirmOpen,
      content: (
        <div className="space-y-5">
          <ClientAccess serverOrigin={serverOrigin} local={false} privateNetwork={serverAccess === "private"} copy={copy} />
          <CompletionNote copy={copy} criterion={copy.openTeamDone} />
        </div>
      ),
    }] : []),
    ...(migrate ? [{
      id: "migration-import",
      title: copy.importTitle,
      body: copy.importGoal,
      canContinue: true,
      continueLabel: copy.confirmImport,
      content: (
        <div className="space-y-5">
          <ClientAccess serverOrigin={path === "local" ? localOrigin : serverOrigin} local={path === "local"} privateNetwork={serverAccess === "private"} copy={copy} />
          <div className={HIGHLIGHT_PANEL}>
            <p className="text-sm font-medium">{copy.importHeading}</p>
            <Checklist items={[copy.importOne, copy.importTwo]} />
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{copy.importNote}</p>
            <CompletionNote copy={copy} criterion={copy.importDone} />
          </div>
        </div>
      ),
    }] : []),
    {
      id: "done",
      title: path === "local" ? copy.doneLocalTitle : copy.doneTeamTitle,
      canContinue: false,
      content: (
        <div className={cn("space-y-5", HIGHLIGHT_PANEL)}>
          <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><p className="text-sm leading-relaxed">{path === "local" ? copy.localTeamAnswer : copy.answerUpdates}</p></div>
          {path === "local" && <Checklist items={[copy.desktopStopInstruction, copy.desktopRestartInstruction]} />}
          {path === "team" && <div className="flex flex-wrap gap-2"><ResourceLink href={links.operations}>{copy.openOperationsGuide}</ResourceLink></div>}
        </div>
      ),
    },
  ];

  const currentIndex = Math.min(stepIndex, stages.length - 1);
  const currentStage = stages[currentIndex];

  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousIndex = useRef(currentIndex);
  useEffect(() => {
    if (previousIndex.current === currentIndex) return;
    previousIndex.current = currentIndex;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [currentIndex]);

  const goBack = () => {
    if (currentIndex === 0) return;
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const continueWizard = () => {
    if (!currentStage.canContinue || currentIndex >= stages.length - 1) return;
    setStepIndex((current) => current + 1);
  };

  const jumpBack = (target: number) => {
    if (target >= currentIndex) return;
    navigatingFromProgress.current = true;
    setProgressOpen(false);
    setStepIndex(target);
  };

  const progressLabel = copy.stepProgress.replace("{current}", String(currentIndex + 1)).replace("{total}", String(stages.length));

  return (
    <section className="min-h-[calc(100dvh-4rem)] px-4 pt-6 pb-16 sm:px-6 sm:pt-8 sm:pb-24">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-center justify-between gap-2">
          <Link href={guidePath} aria-label={copy.backToGuide} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:justify-start">
            <ArrowLeft className="size-4 shrink-0" aria-hidden /><span className="hidden sm:inline">{copy.backToGuide}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Popover open={progressOpen} onOpenChange={setProgressOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-label={`${copy.progressTitle}: ${progressLabel}`} className="inline-flex min-h-11 items-center gap-3 rounded-full bg-[#f3f5ef] px-4 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-[#202821]">
                  {progressLabel}<ChevronDown className="size-4 shrink-0" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} collisionPadding={16}
                onOpenAutoFocus={event => {
                  event.preventDefault();
                  const step = progressStepRef.current;
                  const nav = step?.closest("nav");
                  step?.focus({ preventScroll: true });
                  if (step && nav) nav.scrollTop = step.offsetTop - nav.offsetTop;
                }}
                onCloseAutoFocus={event => {
                  if (!navigatingFromProgress.current) return;
                  event.preventDefault();
                  navigatingFromProgress.current = false;
                  headingRef.current?.focus({ preventScroll: true });
                }}
                className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-3 motion-reduce:animate-none">
                <h2 className="px-2 pt-2 text-base font-medium tracking-tight">{copy.progressTitle}</h2>
                <div role="progressbar" aria-label={copy.progressTitle} aria-valuemin={1} aria-valuemax={stages.length} aria-valuenow={currentIndex + 1} aria-valuetext={progressLabel} className="mx-2 mt-3 mb-4 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div className="h-full rounded-full bg-foreground/65" style={{ width: `${((currentIndex + 1) / stages.length) * 100}%` }} />
                </div>
                <nav aria-label={copy.progressTitle} className="max-h-[min(24rem,50dvh)] overflow-y-auto overscroll-contain">
                  <ol className="space-y-1">
                    {stages.map((stage, index) => {
                      const contents = <><span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", index === currentIndex ? "bg-foreground text-background" : "bg-foreground/5")}>{index < currentIndex ? <Check className="size-3.5" /> : index + 1}</span><span className="text-sm leading-snug">{stage.title}</span></>;
                      return <li key={stage.id} ref={index === currentIndex ? progressStepRef : undefined} tabIndex={index === currentIndex ? -1 : undefined} aria-current={index === currentIndex ? "step" : undefined} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                        {index < currentIndex ? <button type="button" onClick={() => jumpBack(index)} className="flex min-h-11 w-full items-center gap-3 rounded-xl p-2 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring">{contents}</button>
                          : <div className={cn("flex min-h-11 items-center gap-3 rounded-xl p-2", index === currentIndex ? "bg-muted font-medium" : "text-muted-foreground")}>{contents}</div>}
                      </li>;
                    })}
                  </ol>
                </nav>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <div className="mt-6 sm:mt-10">
          <div className="min-w-0">
            <div key={currentStage.id} className="animate-in fade-in duration-200 motion-reduce:animate-none">
              <h1 ref={headingRef} tabIndex={-1} className="max-w-3xl text-[clamp(2rem,3.8vw,3.25rem)] leading-[1.1] font-medium tracking-[-0.045em] text-balance outline-none">{currentStage.title}</h1>
              {currentStage.body && <p className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground">{currentStage.body}</p>}
              <div className="mt-8 min-w-0">{currentStage.content}</div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={goBack} disabled={currentIndex === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-0">
                <ArrowLeft className="size-4" aria-hidden />{copy.backLabel}
              </button>
              {currentIndex < stages.length - 1 && <button type="button" onClick={continueWizard} disabled={!currentStage.canContinue} className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-35">{currentStage.continueLabel ?? copy.continueLabel}<ArrowRight className="size-4 shrink-0" aria-hidden /></button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
