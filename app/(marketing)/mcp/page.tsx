import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, KeyRound, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { localizedHref } from "@/lib/locale-href";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { CopyButton } from "@/components/marketing/copy-button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { MCP_FAQ_KEYS } from "@/components/marketing/faq-keys";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { TrackedCta } from "@/components/marketing/tracked-cta";

/**
 * `/mcp` — the public doc of the MCP server (MIN-93).
 *
 * This is the page that targets a request that minddy can actually win:
 * “MCP issue tracker”, “connect Claude Code to my tickets” — not
 * “best project management tool”, where one will never exist.
 *
 * She does NOT claim that minddy would be the only tracker to speak MCP: Linear,
 * Atlassian and Notion each publish their own. It just shows what we
 * gets it here, in one command.
 *
 * Three rules dictated the form:
 *
 * 1. **Nothing copied.** The configuration blocks come from
 * `lib/mcp-agents.ts` (the same register as the account settings), and this
 * what an agent does is said with the SAME keys as the “Agents” section of
 * the landing (`Landing.agentsCapability_*`). An agent added there appears
 * here, with no copy to maintain.
 * 2. **Everything in the HTML rendered by the server.** GPTBot, ClaudeBot and
 * PerplexityBot does not execute JavaScript: the seven blocks of
 * configuration are rendered server-side, all, rather than hidden behind a
 * tab selector which would have only exposed one.
 * 3. **Nothing about plumbing.** An early version listed the thirty-two
 * tools one by one, with their parameters, transport and mode
 * customer registration — the page described HOW it works
 * someone who just wants to know what it feels like. The complete reference,
 * still exists for machines: `/llms.txt` and `/llms-full.txt`, all
 * two derivatives of the server.
 */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "mcp", locale: (await getLocale()) as Locale });
}

/** The three guarantees of authorization, in order of the OAuth flow. */
const AUTH_POINTS = [
  { key: "who", icon: UserCheck },
  { key: "consent", icon: ShieldCheck },
  { key: "revoke", icon: KeyRound },
] as const;

/** The three routes, in the order in which they are discovered. */
const FLOW_KEYS = ["plan", "track", "create"] as const;

/**
 * What an agent does, says with the landing keys (`Landing`) rather
 * than with the list of server tools: it is the same information, written
 * for someone who wants to know what they're getting — not what function
 * appeler.
 */
const CAPABILITY_KEYS = [
  "read",
  "plan",
  "track",
  "create",
  "comment",
  // MIN-273: the pages. They come after “comment” because it’s
  // the order of the gesture — we read and write the tickets, then the doc who
  // explique.
  "wiki",
  "review",
  "beyond",
] as const;

export default async function McpPage() {
  const locale = (await getLocale()) as Locale;
  const [t, tl] = await Promise.all([
    getTranslations("Mcp"),
    getTranslations("Landing"),
  ]);

  const faqItems = MCP_FAQ_KEYS.map((key) => ({
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

      {/* ── What it is ───────────────────────── ────────────────────────── */}
      <section className="pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mb-3 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("heroSubtitle")}
          </Reveal>
          <Reveal as="p" delay={0.2} className="max-w-2xl text-sm text-muted-foreground">
            {t("heroNote")}
          </Reveal>

          {/* The address, at the top, with something to copy it: it's the only one
              something that someone comes here looking for without knowing where to find it.
              Transport and exchange format have been removed — no one
              doesn't need it to connect his agent. */}
          <Reveal
            delay={0.25}
            className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
          >
            <Fact label={t("factEndpoint")}>
              <span className="flex flex-wrap items-center gap-3">
                <code className="font-mono text-xs break-all text-foreground">
                  {MCP_ENDPOINT}
                </code>
                <CopyButton
                  text={MCP_ENDPOINT}
                  label={t("copy")}
                  copiedLabel={t("copied")}
                />
              </span>
            </Fact>
            <Fact label={t("factAuth")}>{t("factAuthValue")}</Fact>
          </Reveal>
        </div>
      </section>

      {/* ── Connect your agent ───────────────────────────────────────────── */}
      <section id="connect" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("connectTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("connectSubtitle")}
            </Reveal>
          </header>

          {/* `[&>*]:min-w-0`: an installation command is not cut, and
              a grid child has `min-width: auto` — without that the card
              would overrun its track and cause the page to scroll sideways. */}
          <RevealGroup
            as="ul"
            step={0.06}
            className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0"
          >
            {MCP_AGENTS.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                copy={t("copy")}
                copied={t("copied")}
                hint={t(`kind_${agent.kind}`)}
              />
            ))}
          </RevealGroup>

          {/* The shortcut, AFTER the blocks to stick: the one who already knows what
              make finds his order right away, and whoever doesn't want
              choose falls on the emergency exit just below.

              A prompt, not a link to `/llms.txt`: this file remains a
              resource for MACHINES, but to show it was to ask
              for the visitor to go and read it. The prompt sends him there without him having to
              know it. The address and guide are INTERPOLATED from
              `lib/site.ts` — a prompt which contains a copied URL would be
              the only place on the site that can designate a moved server. */}
          <Reveal className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
            <h3 className="mb-2 font-medium">{t("assistantTitle")}</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {t("assistantBody")}
            </p>
            {/* Stacked, and not the prompt to the left of the button: a sentence of
                forty words next to a button gives, under 400 px, a column
                of text three characters wide. Action first,
                text that she copies below — we don't need to read it
                to use it. */}
            <CopyButton
              text={assistantPrompt}
              label={t("copyPrompt")}
              copiedLabel={t("copied")}
            />
            <p className="mt-3 rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {assistantPrompt}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── L'autorisation ───────────────────────────────────────────────── */}
      <section id="auth" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("authTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("authSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ul" step={0.08} className="grid gap-8 sm:grid-cols-3">
            {AUTH_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.key}>
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mb-2 font-medium">{t(`auth_${point.key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`auth_${point.key}_body`)}
                  </p>
                </li>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── Tools ────────────────────────── ─────────────────────────── */}
      <section id="tools" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("toolsTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("toolsSubtitle")}
            </Reveal>
          </header>

          {/* Eight sentences, not forty function names: the list of
              tools said the same thing by asking the reader to
              translate. These are the keys to the landing — just one copy. */}
          <RevealGroup as="ul" step={0.06} className="grid gap-3 sm:grid-cols-2">
            {CAPABILITY_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {tl(`agentsCapability_${key}`)}
                </span>
              </li>
            ))}
          </RevealGroup>

        </div>
      </section>

      {/* ── The routes ───────────────────────── ────────────────────────── */}
      <section id="flows" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("flowsTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("flowsSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ol" step={0.1} className="flex flex-col gap-10 [&>*]:min-w-0">
            {FLOW_KEYS.map((key, index) => (
              <li key={key} className="flex gap-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-sm text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="mb-2 text-xl font-semibold tracking-tight">
                    {t(`flow_${key}_title`)}
                  </h3>
                  <p className="mb-4 leading-relaxed text-pretty text-muted-foreground">
                    {t(`flow_${key}_body`)}
                  </p>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground/80">
                    {t("flowPromptLabel")}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <code className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-foreground">
                      {t(`flow_${key}_prompt`)}
                    </code>
                    <CopyButton
                      text={t(`flow_${key}_prompt`)}
                      label={t("copy")}
                      copiedLabel={t("copied")}
                    />
                  </div>
                </div>
              </li>
            ))}
          </RevealGroup>

          <Reveal delay={0.2} className="mt-12">
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="mcp_page">
                {tl("ctaButton")}
                <ArrowRight data-icon="inline-end" />
              </TrackedCta>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── The three objections ───────────────────── ────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 className="mb-8 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {tl("faqTitle")}
          </h2>
          <FaqAccordion items={faqItems} />
          <p className="mt-8 text-sm text-muted-foreground">
            <Link
              href={localizedHref("/pricing", locale)}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {tl("navPricing")}
            </Link>
          </p>
        </div>
      </section>

      <SectionCta />
    </>
  );
}

/** A box on the fact map: label above, value below. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background p-5">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground/80">
        {label}
      </p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}

/** The ready-to-paste block of an agent: a command, a config or the URL of the
    server, always copyable — no agent installs in one click. */
function AgentCard({
  agent,
  copy,
  copied,
  hint,
}: {
  agent: McpAgent;
  copy: string;
  copied: string;
  hint: string;
}) {
  const artifact = agent.build(MCP_ENDPOINT);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <McpAgentLogo agent={agent.id} size={20} />
        <span className="text-sm font-medium">{agent.label}</span>
      </div>

      {/* `overflow-x-auto` on the block and not `break-all`: a command
          cut in the middle of a word fits together badly when you select it
          by hand. */}
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2",
          "font-mono text-xs leading-relaxed text-foreground",
        )}
      >
        <code>{artifact}</code>
      </pre>
      <CopyButton text={artifact} label={copy} copiedLabel={copied} className="w-fit" />

      <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </li>
  );
}
