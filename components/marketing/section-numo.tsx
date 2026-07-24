import { getTranslations } from "next-intl/server";
import { Crosshair, PencilLine, Rocket, Search, type LucideIcon } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";

/**
 * Numo, l'assistant intégré — sa propre section plutôt qu'une case de la grille.
 *
 * Miroir de la section MCP : capture à gauche, texte à droite. Là où la section
 * agents parle de ce que les agents EXTERNES font du tracker, celle-ci parle de
 * ce que minddy sait faire tout seul.
 *
 * Les exemples du bandeau sont ceux que l'app propose vraiment au démarrage
 * d'une conversation (`Assistant.starter` côté app) : ce qu'on montre ici est ce
 * qu'on lit là-bas.
 */

const CAPABILITIES: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "find", icon: Search },
  { key: "act", icon: PencilLine },
  { key: "plan", icon: Rocket },
  { key: "context", icon: Crosshair },
];

const EXAMPLES = ["triage", "assign", "view", "plan"] as const;

export async function SectionNumo() {
  const t = await getTranslations("Landing");

  return (
    <section id="numo" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16 [&>*]:min-w-0">
          <Reveal>
            <ScreenshotSlot id="numoPanel" />
          </Reveal>

          <div>
            <Reveal
              as="span"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm"
            >
              <NumoIcon animated={false} className="h-3.5 w-auto text-primary" />
              Numo
            </Reveal>

            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
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
              {CAPABILITIES.map((capability) => {
                const Icon = capability.icon;
                return (
                  <li key={capability.key} className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="mb-1 font-medium">
                        {t(`numoCapability_${capability.key}_title`)}
                      </h3>
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
            {EXAMPLES.map((example) => (
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
    </section>
  );
}
