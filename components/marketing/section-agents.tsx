import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { BrandLogo } from "@/components/brand-logo";
import { NumoFace } from "@/components/numo-face";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";
import type { ScreenshotSlotId } from "./screenshot-slots";

/**
 * §4 — « Vos agents travaillent dedans ». Fusion de trois sections qui
 * told the same gesture: Workflow (the ticket → plan → PR story), Agents /
 * MCP (the plumbing of this story) and Numo (the same story triggered since
 * the app). They followed one another, and the reader read the same thing three times.
 *
 * A single wire, in the order of the plumbing: we connect (the MCP server), your
 * agents keep the tracker up to date, the in-house agent executes and opens the PRs,
 * and Numo does the same thing from the app with the context of the page.
 *
 * This is where the page makes the availability explicit: the MCP server and
 * the Numo agent are included in every plan. The Free plan limits workspace
 * size and AI usage, not access to agents.
 *
 * The installation command and the list of compatible agents come from the same
 * registry as account settings (`lib/mcp-agents.ts`): add an agent
 * over there makes it appear here, with no copy to maintain.
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

/**
 * What Numo can do that nothing else does: search, act, and
 * know the screen you are on. The 4th ability — “he plans, then he
 * lance” — was withdrawn: she repeated word for word the route in three
 * time which now precedes it in the same section.
 */
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
        {/* ── The connection ─────────────────────── ──────────────────────── */}
        {/* min-w-0 on both columns: a grid child has
            `min-width: auto`, therefore the installation command (not divisible)
            would expand the map beyond its track and scroll the entire
            page sideways on mobile. */}
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

          {/* A showcase, not instructions: logo + name boxes, and nothing
              to copy. The visitor does not install from the landing — he wants
              find out if HIS agent is on board. The installation command
              (and its “copy” button) lives in the account settings, where
              elle sert vraiment. */}
          <Reveal
            delay={0.1}
            className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6"
          >
            <p className="mb-4 text-sm font-medium">{t("agentsCompatible")}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MCP_AGENTS.map((agent) => (
                <li
                  key={agent.id}
                  className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-2 py-5 text-center text-xs font-medium text-foreground/90 shadow-sm"
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

        {/* ── The route ───────────────────────── ───────────────────────── */}
        <div id="workflow" className="mt-20 scroll-mt-24 sm:mt-28">
          <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
            <RevealHeading
              as="h3"
              className="mb-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              text={t("workflowTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="leading-relaxed text-pretty text-muted-foreground"
            >
              {t("workflowSubtitle")}
            </Reveal>
          </header>

          {/* Alternating left/right layout. The waterfall is placed on the
              grid itself (`RevealGroup`) and not on envelopes, otherwise
              `md:order-*` classes would no longer apply to the correct element. */}
          <div className="flex flex-col gap-14 sm:gap-20">
            {STEPS.map((step, index) => (
              <RevealGroup
                key={step.key}
                step={0.12}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div className={cn(index % 2 === 1 && "md:order-2")}>
                  <span className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card font-mono text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <h4 className="mb-3 text-xl font-semibold tracking-tight">
                    {t(`workflow_${step.key}_title`)}
                  </h4>
                  <p className="leading-relaxed text-pretty text-muted-foreground">
                    {t(`workflow_${step.key}_body`)}
                  </p>
                </div>
                <ScreenshotSlot id={step.slot} className={cn(index % 2 === 1 && "md:order-1")} />
              </RevealGroup>
            ))}
          </div>
        </div>

        {/* ── Numo, depuis l'app ─────────────────────────────────────────── */}
        <div id="numo" className="mt-20 scroll-mt-24 sm:mt-28">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16 [&>*]:min-w-0">
            <Reveal>
              <ScreenshotSlot id="numoPanel" />
            </Reveal>

            <div>
              {/* The icon bears the identity of Numo; the “Numo” badge which was
                  here jumped out — it was in hard copy, not translated, and repeated a
                  title that already begins with the word. */}
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
