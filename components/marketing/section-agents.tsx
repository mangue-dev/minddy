import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { BrandLogo } from "@/components/brand-logo";
import { NumoFace } from "@/components/numo-face";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";
import type { ScreenshotSlotId } from "./screenshot-slots";

/**
 * One agent story: connect over MCP, move an issue through a pull request,
 * then use Numo from inside the product. Compatible agents come from the same
 * registry as account settings (`lib/mcp-agents.ts`).
 */

const CAPABILITY_KEYS = [
  "read",
  "plan",
  "track",
  "create",
  "comment",
  "wiki",
  "review",
  "beyond",
] as const;

/** The three stages of a ticket entrusted to the code agent. */
const STEPS = [
  { key: "write", slot: "workflowIssue" },
  { key: "run", slot: "workflowAgent" },
  { key: "review", slot: "workflowPr" },
] as const satisfies ReadonlyArray<{ key: string; slot: ScreenshotSlotId }>;

/** What distinguishes Numo: it can search, act, and use the current screen as context. */
const NUMO_CAPABILITIES = [
  { key: "find", icon: "find" },
  { key: "act", icon: "pencil" },
  { key: "context", icon: "context" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

const NUMO_EXAMPLES = ["triage", "assign", "view", "plan"] as const;

export async function SectionAgents() {
  const t = await getTranslations("Landing");

  return (
    <section id="agents" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* `min-w-0` prevents long agent names from widening the page. */}
        <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16 [&>*]:min-w-0">
          <div>
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("agentsTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="mb-8 leading-relaxed text-pretty text-muted-foreground"
            >
              {t("agentsSubtitle")}
            </Reveal>

            <RevealGroup as="ul" step={0.07} className="flex flex-col gap-3">
              {CAPABILITY_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {t(`agentsCapability_${key}`)}
                  </span>
                </li>
              ))}
            </RevealGroup>
          </div>

          {/* This is compatibility proof. Installation stays in account settings,
              where the visitor has a real endpoint and can use the command. */}
          <Reveal
            delay={0.1}
            className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6"
          >
            <p className="mb-4 text-sm font-medium">{t("agentsCompatible")}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MCP_AGENTS.map((agent) => (
                <li
                  key={agent.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-4 text-left text-xs font-medium text-foreground/90 shadow-sm"
                >
                  <BrandLogo brand={agent} className="h-6 w-6" />
                  {agent.label}
                </li>
              ))}
            </ul>

            {/* What the agent costs, and to whom. The second sentence is the only
                landing-page mention of BYOK (MIN-149). The full detail lives in
                the “Your key, your inference” section of /pricing. */}
            <p className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
              {t("agentsPlanNote")} {t("agentsByokNote")}
            </p>
          </Reveal>
        </div>

        <div id="workflow" className="mt-20 scroll-mt-24 sm:mt-28">
          <header className="mb-10 max-w-2xl sm:mb-12">
            <RevealHeading
              as="h3"
              className="text-2xl font-semibold tracking-tight text-balance sm:text-4xl"
              text={t("workflowTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="mt-3 leading-relaxed text-pretty text-muted-foreground"
            >
              {t("workflowSubtitle")}
            </Reveal>
          </header>

          <RevealGroup className="grid gap-4 lg:grid-cols-3" step={0.1}>
            {STEPS.map((step) => (
              <article
                key={step.key}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <ScreenshotSlot id={step.slot} className="rounded-none border-0 border-b" />
                <div className="p-6">
                  <h4 className="mb-2 text-lg font-semibold tracking-tight">
                    {t(`workflow_${step.key}_title`)}
                  </h4>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {t(`workflow_${step.key}_body`)}
                  </p>
                </div>
              </article>
            ))}
          </RevealGroup>
        </div>

        <div id="numo" className="mt-20 scroll-mt-24 sm:mt-28">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16 [&>*]:min-w-0">
            <Reveal>
              <ScreenshotSlot id="numoPanel" />
            </Reveal>

            <div>
              {/* Numo has its own mark, so a separate text badge would be redundant. */}
              <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-primary">
                <NumoFace className="h-4 w-auto" />
              </span>

              <RevealHeading
                as="h3"
                className="mb-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
                text={t("numoTitle")}
              />
              <Reveal
                as="p"
                delay={0.15}
                className="mb-8 leading-relaxed text-pretty text-muted-foreground"
              >
                {t("numoSubtitle")}
              </Reveal>

              <RevealGroup as="ul" className="flex flex-col gap-6">
                {NUMO_CAPABILITIES.map((capability) => (
                  <li key={capability.key} className="flex items-start gap-4">
                    <IsoTile name={capability.icon} className="mt-0.5 w-12 shrink-0" />
                    <div>
                      <h4 className="mb-1 font-medium">
                        {t(`numoCapability_${capability.key}_title`)}
                      </h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t(`numoCapability_${capability.key}_body`)}
                      </p>
                    </div>
                  </li>
                ))}
              </RevealGroup>
            </div>
          </div>

          <Reveal className="mt-12 rounded-2xl border border-border bg-muted/30 p-5 sm:mt-16 sm:p-6">
            <p className="mb-4 text-sm font-medium">{t("numoExamplesTitle")}</p>
            <ul className="flex flex-wrap gap-2">
              {NUMO_EXAMPLES.map((example) => (
                <li
                  key={example}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground/90 shadow-sm"
                >
                  {t(`numoExample_${example}`)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
