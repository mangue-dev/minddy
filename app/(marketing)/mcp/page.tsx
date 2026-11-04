import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CheckListIcon, Key02Icon, MessageAdd01Icon, ShieldCheckIcon as ShieldCheck, SparklesIcon, TaskDone01Icon, TerminalIcon as Terminal, CheckIcon, UserCheck01Icon, Copy01Icon, SquareTerminalIcon, GitMergeIcon, Comment01Icon, CommentAdd01Icon, ApiIcon } from "@hugeicons/core-free-icons";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { AppIcon } from "@/components/icon";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { CopyButton } from "@/components/marketing/copy-button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { FaqAskBox } from "@/components/marketing/faq-ask-box";
import { MCP_FAQ_KEYS } from "@/components/marketing/faq-keys";
import { SectionCta } from "@/components/marketing/section-cta";
import { SectionHeading } from "@/components/marketing/section-heading";
import { FigureScope } from "@/components/marketing/figure-scope";
import { PointGrid } from "@/components/marketing/feature-chapter";
import { AgentTerminal, MergedPullRequest, PromptMenu } from "@/components/marketing/figures/agent-figures";
import { IssueCommentFollowUp, IssuePullRequest, WebhookLog } from "@/components/marketing/figures/card-figures";
import { StructuredData } from "@/components/marketing/structured-data";
import { PlatformDownloadLink } from "@/components/marketing/platform-download-link";
import { localizedHref } from "@/lib/locale-href";

/** Public MCP setup and workflows; all configuration artifacts remain in server HTML. */
export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "mcp", locale: (await getLocale()) as Locale });
}

const AUTH_POINTS = [
  { key: "who", icon: UserCheck01Icon, tone: CARD_TONES.sky },
  { key: "consent", icon: ShieldCheck, tone: CARD_TONES.sage },
  { key: "revoke", icon: Key02Icon, tone: CARD_TONES.peach },
] as const;

const FLOWS = [
  { key: "plan", icon: CheckListIcon, tone: CARD_TONES.lavender },
  { key: "track", icon: TaskDone01Icon, tone: CARD_TONES.sage },
  { key: "create", icon: MessageAdd01Icon, tone: CARD_TONES.peach },
] as const;

/** Reuse the landing's capability descriptions and the account's agent registry. */
const CAPABILITY_KEYS = ["read", "plan", "track", "create", "comment", "wiki", "review", "beyond"] as const;
const AGENT_TONES = [CARD_TONES.peach, CARD_TONES.butter, CARD_TONES.sky, CARD_TONES.sage, CARD_TONES.lavender, CARD_TONES.rose];
const COPY_BUTTON = "min-h-11 rounded-full border-current/15 bg-background/65 px-4 text-current hover:bg-background/90 hover:text-current";

export default async function McpPage() {
  const [t, tl, ta, tCommon] = await Promise.all([
    getTranslations("Mcp"),
    getTranslations("Landing"),
    getTranslations("Account"),
    getTranslations("Common"),
  ]);
  const locale = (await getLocale()) as Locale;
  const faqItems = MCP_FAQ_KEYS.map(key => ({
    key,
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));
  const assistantPrompt = t("assistantPrompt", {
    endpoint: MCP_ENDPOINT,
    guide: `${SITE_URL}/llms.txt`,
  });

  return (
    <>
      <StructuredData variant="mcp" />
      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <header className="mb-12 max-w-3xl sm:mb-16">
            <h1 className="text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
              {t("heroTitle")}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              {t("heroSubtitle")}
            </p>
            <Button asChild size="lg" className="mt-7 rounded-full">
              <a href="#connect">{t("connectTitle")}<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></a>
            </Button>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <div className={cn("flex min-w-0 flex-col justify-between gap-8 rounded-2xl p-6 sm:p-8 md:col-span-2", CARD_TONES.sage)}>
              <div className="flex items-center gap-3">
                <AppIcon icon={Terminal} className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
                <h2 className="text-xl font-medium tracking-tight">{t("factEndpoint")}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <code className="min-w-0 font-mono text-base leading-relaxed break-all sm:text-xl">{MCP_ENDPOINT}</code>
                <CopyButton text={MCP_ENDPOINT} label={tCommon("copy")} copiedLabel={tCommon("copied")} className={COPY_BUTTON} />
              </div>
            </div>
            <div className={cn("rounded-2xl p-6 sm:p-8", CARD_TONES.butter)}>
              <AppIcon icon={ShieldCheck} className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h2 className="text-xl font-medium tracking-tight">{t("factAuthValue")}</h2>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("heroNote")}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("connectTitle")} description={t("connectSubtitle")} />
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            <li className={cn("flex flex-col rounded-2xl p-6 sm:p-8 md:col-span-2", CARD_TONES.sky)}>
              <HugeiconsIcon icon={SparklesIcon} className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h3 className="text-2xl font-medium tracking-tight">{t("assistantTitle")}</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-80">{t("assistantBody")}</p>
              <p className="mt-5 rounded-xl bg-background/50 p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
                {assistantPrompt}
              </p>
              <div className="mt-auto pt-5">
                <CopyButton text={assistantPrompt} label={t("copyPrompt")} copiedLabel={tCommon("copied")} className={COPY_BUTTON} />
              </div>
            </li>
            {MCP_AGENTS.map((agent, index) => (
              <AgentCard key={agent.id} agent={agent} copy={tCommon("copy")} copied={tCommon("copied")}
                hint={ta(agent.hint)} tone={AGENT_TONES[index % AGENT_TONES.length]} />
            ))}
          </ul>
        </div>
      </section>

      <section id="tools" className="scroll-mt-24 bg-[#f4f6f9] px-4 py-16 sm:px-6 sm:py-20 dark:bg-[#12171d]">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("toolsTitle")} description={t("toolsSubtitle")} />
          <FigureScope>
            <PointGrid
              className="mt-0"
              tone="sky"
              points={[
                { icon: Copy01Icon, title: tl("toolsScene_prompt_title"), body: tl("toolsScene_prompt_body"), shot: { node: <PromptMenu /> } },
                { icon: SquareTerminalIcon, title: tl("toolsScene_work_title"), body: tl("toolsScene_work_body"), shot: { node: <AgentTerminal /> } },
                { icon: GitMergeIcon, title: tl("toolsScene_merge_title"), body: tl("toolsScene_merge_body"), shot: { node: <MergedPullRequest /> } },
              ]}
            />
            <PointGrid
              className="mt-12"
              tone="sky"
              points={[
                { icon: Comment01Icon, title: tl("tools_review_title"), body: tl("tools_review_body"), shot: { node: <IssuePullRequest /> } },
                { icon: CommentAdd01Icon, title: tl("tools_followUp_title"), body: tl("tools_followUp_body"), shot: { node: <IssueCommentFollowUp /> } },
                { icon: ApiIcon, title: tl("tools_api_title"), body: tl("tools_api_body"), shot: { node: <WebhookLog /> } },
              ]}
            />
          </FigureScope>
          <ul className={cn("mt-4 grid gap-x-8 gap-y-4 rounded-2xl p-6 sm:grid-cols-2 sm:p-8", CARD_TONES.lavender)}>
            {CAPABILITY_KEYS.map(key => (
              <li key={key} className="flex items-start gap-3 text-sm leading-relaxed">
                <HugeiconsIcon icon={CheckIcon} className="mt-0.5 size-4 shrink-0" aria-hidden />
                {tl(`agentsCapability_${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="flows" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("flowsTitle")} description={t("flowsSubtitle")} />
          <ul className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            {FLOWS.map(flow => (
              <li key={flow.key} className={cn("flex flex-col rounded-2xl p-6 sm:p-8", flow.tone)}>
                <HugeiconsIcon icon={flow.icon} className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
                <h3 className="text-2xl font-medium tracking-tight">{t(`flow_${flow.key}_title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed opacity-80">{t(`flow_${flow.key}_body`)}</p>
                <div className="mt-auto pt-8">
                  <p className="mb-3 text-xs font-medium opacity-75">{t("flowPromptLabel")}</p>
                  <div className="rounded-xl bg-background/50 p-4">
                    <p className="text-sm leading-relaxed">{t(`flow_${flow.key}_prompt`)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8 rounded-full">
            <PlatformDownloadLink href={localizedHref("/download", locale)} location="mcp_page" />
          </Button>
        </div>
      </section>

      <section id="auth" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("authTitle")} description={t("authSubtitle")} />
          <ul className="grid gap-4 md:grid-cols-3">
            {AUTH_POINTS.map(point => (
              <li key={point.key} className={cn("rounded-2xl p-6 sm:p-8", point.tone)}>
                <AppIcon icon={point.icon} className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
                <h3 className="text-xl font-medium tracking-tight">{t(`auth_${point.key}_title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed opacity-80">{t(`auth_${point.key}_body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">{tl("faqTitle")}</h2>
          <FaqAccordion items={faqItems} footer={<FaqAskBox section="mcp" />} />
        </div>
      </section>
      <SectionCta />
    </>
  );
}

/** Keep commands intact and keyboard-scrollable; copying always uses the shared artifact. */
function AgentCard({ agent, copy, copied, hint, tone }: {
  agent: McpAgent;
  copy: string;
  copied: string;
  hint: string;
  tone: string;
}) {
  const artifact = agent.build(MCP_ENDPOINT);
  return (
    <li className={cn("flex flex-col rounded-2xl p-6 sm:p-8", tone)}>
      <div className="flex items-center gap-3">
        <McpAgentLogo agent={agent.id} size={28} />
        <h3 className="text-xl font-medium tracking-tight">{agent.label}</h3>
      </div>
      <p className="mt-4 text-sm leading-relaxed [overflow-wrap:anywhere] opacity-80">{hint}</p>
      <pre tabIndex={0} role="region" aria-label={agent.label}
        className="mt-5 min-h-24 overflow-x-auto overscroll-x-contain rounded-xl bg-background/50 p-4 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <code>{artifact}</code>
      </pre>
      <div className="mt-auto pt-5">
        <CopyButton text={artifact} label={copy} copiedLabel={copied} className={COPY_BUTTON} />
      </div>
    </li>
  );
}
