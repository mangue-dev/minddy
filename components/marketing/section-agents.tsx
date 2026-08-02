import { getTranslations } from "next-intl/server";
import { Check, Crosshair, PencilLine, Search, type LucideIcon } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { BrandLogo } from "@/components/brand-logo";
import { NumoFace } from "@/components/numo-face";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import type { ScreenshotSlotId } from "./screenshot-slots";

/**
 * §4 — « Vos agents travaillent dedans ». Fusion de trois sections qui
 * racontaient le même geste : Workflow (le récit ticket → plan → PR), Agents /
 * MCP (la plomberie de ce récit) et Numo (le même récit déclenché depuis
 * l'app). Elles se suivaient, et le lecteur lisait trois fois la même chose.
 *
 * Un seul fil, dans l'ordre de la plomberie : on branche (le serveur MCP), vos
 * agents tiennent le tracker à jour, l'agent maison exécute et ouvre les PR,
 * et Numo fait la même chose depuis l'app avec le contexte de la page.
 *
 * C'est ici que se dit ce que la page taisait : le serveur MCP n'est gardé par
 * AUCUN plan (`app/api/mcp/route.ts` ne fait aucun contrôle), alors que l'agent
 * Numo demande Go ou Pro. Le tableau de /pricing affichait « Agent Numo » barré
 * pour Free, et un visiteur en concluait que brancher Claude Code était payant.
 *
 * La commande d'installation et la liste des agents compatibles viennent du même
 * registry que les réglages du compte (`lib/mcp-agents.ts`) : ajouter un agent
 * là-bas le fait apparaître ici, sans copie à maintenir.
 */

const CAPABILITY_KEYS = [
  "read",
  "plan",
  "track",
  "create",
  "comment",
  "review",
  "beyond",
] as const;

/** Les trois temps d'un ticket confié à l'agent de code. */
const STEPS = [
  { key: "write", slot: "workflowIssue" },
  { key: "run", slot: "workflowAgent" },
  { key: "review", slot: "workflowPr" },
] as const satisfies ReadonlyArray<{ key: string; slot: ScreenshotSlotId }>;

/**
 * Ce que Numo sait faire et que rien d'autre ne fait : chercher, agir, et
 * connaître l'écran où vous êtes. La 4ᵉ capacité — « il planifie, puis il
 * lance » — a été retirée : elle redisait mot pour mot le parcours en trois
 * temps qui la précède maintenant dans la même section.
 */
const NUMO_CAPABILITIES = [
  { key: "find", icon: Search },
  { key: "act", icon: PencilLine },
  { key: "context", icon: Crosshair },
] as const satisfies ReadonlyArray<{ key: string; icon: LucideIcon }>;

const NUMO_EXAMPLES = ["triage", "assign", "view", "plan"] as const;

export async function SectionAgents() {
  const t = await getTranslations("Landing");

  return (
    <section id="agents" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* ── Le branchement ─────────────────────────────────────────────── */}
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

          {/* Une vitrine, pas un mode d'emploi : des cases logo + nom, et rien
              à copier. Le visiteur n'installe pas depuis la landing — il veut
              savoir si SON agent est de la partie. La commande d'installation
              (et son bouton « copier ») vit dans les réglages du compte, là où
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

            {/* Ce que coûte l'agent, et à qui. La deuxième phrase est le seul
                endroit de la landing où le BYOK se dit (MIN-149) : elle suit
                celle qui annonce le plan payant, parce que c'est là qu'un dev
                qui a déjà une clé se demande ce qu'on va lui compter. Le détail
                complet est la section « Votre clé, votre inférence » de
                /pricing. */}
            <p className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
              {t("agentsPlanNote")} {t("agentsByokNote")}
            </p>
          </Reveal>
        </div>

        {/* ── Le parcours ────────────────────────────────────────────────── */}
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

          {/* Disposition alternée gauche/droite. La cascade est posée sur la
              grille elle-même (`RevealGroup`) et non sur des enveloppes, sinon
              les classes `md:order-*` ne s'appliqueraient plus au bon élément. */}
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
              {/* L'icône porte l'identité de Numo ; le badge « Numo » qui était
                  ici a sauté — il était en dur, non traduit, et redisait un
                  titre qui commence déjà par le mot. */}
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
                {NUMO_CAPABILITIES.map((capability) => {
                  const Icon = capability.icon;
                  return (
                    <li key={capability.key} className="flex items-start gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="mb-1 font-medium">
                          {t(`numoCapability_${capability.key}_title`)}
                        </h4>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {t(`numoCapability_${capability.key}_body`)}
                        </p>
                      </div>
                    </li>
                  );
                })}
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
