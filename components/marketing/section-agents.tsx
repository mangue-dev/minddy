import { getTranslations } from "next-intl/server";
import { Check, GitPullRequest, Bot } from "lucide-react";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { NumoFace } from "@/components/numo-face";
import { ScreenshotSlot } from "./screenshot-slot";
import { FeatureDisclosure } from "./feature-disclosure";
import { CARD_TONES } from "./card-tones";
import { SectionHeading } from "./section-heading";

const CAPABILITIES = ["read", "plan", "track", "create", "comment", "wiki", "review", "beyond"] as const;
const NUMO_CAPABILITIES = ["find", "act", "context"] as const;

/** Read left to right: the agent works, you review, and both keep the same context. */
export async function SectionAgents() {
  const t = await getTranslations("Landing");
  return (
    <section id="agents" className="scroll-mt-24 bg-[#f4f6f9] px-4 py-16 sm:px-6 sm:py-20 dark:bg-[#12171d]">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={t("agentsTitle")} description={t("agentsSubtitle")} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FeatureDisclosure id="workflow" title={t("workflow_run_title")} className={`h-[460px] ${CARD_TONES.lavender}`}
            details={<div className="space-y-5"><p>{t("workflow_write_body")}</p><p>{t("workflow_run_body")}</p><p>{t("workflowSubtitle")}</p></div>}>
            <div className="flex h-full flex-col px-6 pt-6 pb-20 sm:px-8 sm:pt-8">
              <Bot className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h3 className="text-2xl font-medium tracking-tight">{t("workflow_run_title")}</h3>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("workflow_run_body")}</p>
              <div className="relative -mr-6 mt-6 min-h-0 flex-1 overflow-hidden sm:-mr-8">
                <ScreenshotSlot id="workflowAgent" sizes="(min-width: 1024px) 500px, 100vw" className="w-[145%] border-black/10 shadow-none dark:border-white/10" />
              </div>
            </div>
          </FeatureDisclosure>
          <FeatureDisclosure title={t("workflow_review_title")} className={`h-[460px] lg:col-span-2 ${CARD_TONES.sage}`}
            details={<div className="space-y-5"><p>{t("workflow_review_body")}</p><p>{t("workflowSubtitle")}</p><ScreenshotSlot id="workflowPr" sizes="(min-width: 1024px) 700px, 100vw" /></div>}>
            <div className="flex h-full flex-col px-6 pt-6 pb-20 sm:px-8 sm:pt-8">
              <GitPullRequest className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h3 className="text-2xl font-medium tracking-tight">{t("workflow_review_title")}</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-80">{t("workflow_review_body")}</p>
              <div className="relative -mr-6 mt-6 min-h-0 flex-1 overflow-hidden sm:-mr-8">
                <ScreenshotSlot id="workflowPr" sizes="(min-width: 1024px) 752px, 100vw" className="w-full border-black/10 shadow-none dark:border-white/10" />
              </div>
            </div>
          </FeatureDisclosure>
          <FeatureDisclosure id="numo" title={t("numoTitle")} className={`h-[440px] lg:col-span-2 ${CARD_TONES.sky}`}
            details={<dl className="space-y-5">{NUMO_CAPABILITIES.map(key => <div key={key}><dt className="font-medium">{t(`numoCapability_${key}_title`)}</dt><dd className="mt-1 opacity-85">{t(`numoCapability_${key}_body`)}</dd></div>)}</dl>}>
            <div className="flex h-full flex-col px-6 pt-6 pb-20 sm:px-8 sm:pt-8">
              <NumoFace className="mb-5 h-5 w-fit" />
              <h3 className="text-2xl font-medium tracking-tight">{t("numoTitle")}</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-80">{t("numoSubtitle")}</p>
              <div className="relative -mr-6 mt-6 min-h-0 flex-1 overflow-hidden sm:-mr-8">
                <ScreenshotSlot id="numoPanel" sizes="(min-width: 1024px) 752px, 100vw" className="absolute right-0 bottom-0 w-[140%] border-black/10 shadow-none lg:w-full dark:border-white/10" />
              </div>
            </div>
          </FeatureDisclosure>
          <FeatureDisclosure title={t("navMenu_agents_title")} className={`h-[440px] ${CARD_TONES.butter}`}
            details={<><p className="mb-5">{t("agentsPlanNote")} {t("agentsByokNote")}</p><ul className="space-y-3">{CAPABILITIES.map(key => <li key={key} className="flex gap-3"><Check className="mt-1 size-4 shrink-0" aria-hidden />{t(`agentsCapability_${key}`)}</li>)}</ul></>}>
            <div className="flex h-full flex-col p-6 pb-20 sm:p-8 sm:pb-20">
              <h3 className="text-2xl font-medium tracking-tight">{t("agentsCompatible")}</h3>
              <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7">
                {MCP_AGENTS.map(agent => <li key={agent.id} className="flex min-w-0 items-center gap-2 text-xs font-medium"><McpAgentLogo agent={agent.id} size={24} />{agent.label}</li>)}
              </ul>
            </div>
          </FeatureDisclosure>
        </div>
      </div>
    </section>
  );
}
