import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { MCP_ENDPOINT } from "@/lib/site";
import { AgentLogo } from "@/components/settings/agent-logo";
import { CopyCommand } from "./copy-command";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";

/**
 * Section MCP (MIN-73) — l'argument central : minddy n'est pas un tracker qu'on
 * met à jour à la main après coup, c'est un tracker que les agents lisent et
 * écrivent eux-mêmes.
 *
 * La commande d'installation et la liste des agents compatibles viennent du même
 * registry que les réglages du compte (`lib/mcp-agents.ts`) : ajouter un agent
 * là-bas le fait apparaître ici, sans copie à maintenir.
 */

const CAPABILITY_KEYS = ["read", "plan", "track", "create", "comment"] as const;

export async function SectionAgents() {
  const t = await getTranslations("Landing");
  const claudeCode = MCP_AGENTS.find((agent) => agent.id === "claude") ?? MCP_AGENTS[0];

  return (
    <section id="agents" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* min-w-0 sur les deux colonnes : un enfant de grille a
            `min-width: auto`, donc la commande d'installation (non sécable)
            élargirait la carte au-delà de sa piste et ferait scroller toute la
            page latéralement sur mobile. */}
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

          <Reveal
            delay={0.1}
            className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6"
          >
            <p className="mb-3 text-sm font-medium">{t("agentsInstallTitle")}</p>
            <CopyCommand command={claudeCode.build(MCP_ENDPOINT)} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t("agentsInstallNote")}
            </p>

            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-4 text-xs text-muted-foreground">{t("agentsCompatible")}</p>
              <ul className="flex flex-wrap items-center gap-2">
                {MCP_AGENTS.map((agent) => (
                  <li
                    key={agent.id}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground/90 shadow-sm"
                  >
                    <AgentLogo agent={agent} className="h-3.5 w-3.5" />
                    {agent.label}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
