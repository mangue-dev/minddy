import { getTranslations } from "next-intl/server";
import { ArrowUpRight, Check } from "lucide-react";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { NumoFace } from "@/components/numo-face";
import { ScreenshotSlot } from "./screenshot-slot";
import { FeatureDisclosure } from "./feature-disclosure";

const CAPABILITIES = ["read", "plan", "track", "create", "comment", "wiki", "review", "beyond"] as const;
const STEPS = ["write", "run", "review"] as const;
const NUMO_CAPABILITIES = ["find", "act", "context"] as const;
const NUMO_EXAMPLES = ["triage", "assign", "view", "plan"] as const;

/** Show the reviewable result first, then explain how agents stay in context. */
export async function SectionAgents() {
  const t = await getTranslations("Landing");

  return (
    <section id="agents" className="scroll-mt-24 border-y border-border bg-muted/20 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 grid gap-5 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <h2 className="max-w-xl text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">{t("agentsTitle")}</h2>
          <p className="max-w-md self-end leading-relaxed text-muted-foreground">{t("agentsSubtitle")}</p>
        </header>

        <div id="workflow" className="grid scroll-mt-24 items-start gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
          <figure className="rounded-xl border border-border bg-background p-2 sm:p-4">
            <ScreenshotSlot id="workflowPr" sizes="(min-width: 1024px) 608px, calc(100vw - 64px)" className="shadow-none" />
            <figcaption className="px-1 pt-4 pb-1 text-xs text-muted-foreground">{t("workflowSubtitle")}</figcaption>
          </figure>
          <div>
            <h3 className="mb-2 text-2xl font-medium tracking-tight">{t("workflowTitle")}</h3>
            <ol className="divide-y divide-border">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-4 py-5">
                  <span className="pt-1 font-mono text-xs text-muted-foreground" aria-hidden>0{index + 1}</span>
                  <div>
                    <h4 className="font-medium">{t(`workflow_${step}_title`)}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`workflow_${step}_body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-12 grid items-start gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-background p-6 sm:p-8">
            <h3 className="text-lg font-medium tracking-tight">{t("agentsCompatible")}</h3>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
              {MCP_AGENTS.map((agent) => (
                <li key={agent.id} className="flex min-w-0 items-center gap-2.5 text-xs font-medium">
                  <McpAgentLogo agent={agent.id} size={22} />
                  {agent.label}
                </li>
              ))}
            </ul>
            <p className="my-6 text-xs leading-relaxed text-muted-foreground">{t("agentsPlanNote")} {t("agentsByokNote")}</p>
            <FeatureDisclosure title={t("navMenu_agents_title")}>
              <ul className="space-y-3 text-muted-foreground">
                {CAPABILITIES.map((key) => (
                  <li key={key} className="flex gap-3">
                    <Check className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
                    {t(`agentsCapability_${key}`)}
                  </li>
                ))}
              </ul>
            </FeatureDisclosure>
          </article>

          <article id="numo" className="scroll-mt-24 rounded-xl bg-[#e6edf5] p-6 text-[#293d56] sm:p-8 dark:bg-[#232e3c] dark:text-[#dce7f4]">
            <div className="mb-5 flex items-center justify-between">
              <NumoFace className="h-5 w-auto" />
              <ArrowUpRight className="size-4 opacity-60" aria-hidden />
            </div>
            <h3 className="text-2xl font-medium tracking-tight">{t("numoTitle")}</h3>
            <p className="mt-3 text-sm leading-relaxed opacity-80">{t("numoSubtitle")}</p>
            <div className="my-6 rounded-lg border border-current/15 px-4 py-3 text-sm">{t("numoExample_triage")}</div>
            <FeatureDisclosure title={t("numoTitle")}>
              <ScreenshotSlot id="numoPanel" sizes="(min-width: 1024px) 504px, calc(100vw - 96px)" className="mb-6" />
              <dl className="space-y-4">
                {NUMO_CAPABILITIES.map((key) => (
                  <div key={key}>
                    <dt className="font-medium">{t(`numoCapability_${key}_title`)}</dt>
                    <dd className="mt-1 opacity-80">{t(`numoCapability_${key}_body`)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 font-medium">{t("numoExamplesTitle")}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 opacity-80">
                {NUMO_EXAMPLES.map((key) => <li key={key}>{t(`numoExample_${key}`)}</li>)}
              </ul>
            </FeatureDisclosure>
          </article>
        </div>
      </div>
    </section>
  );
}
