import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import type { ScreenshotSlotId } from "./screenshot-slots";

/**
 * « Comment ça marche » (MIN-73) : les trois temps d'une issue confiée à un
 * agent. Disposition alternée gauche/droite — le texte reste court, la capture
 * fait la démonstration.
 *
 * Chaque temps entre au scroll comme un bloc : le texte, puis sa capture. La
 * cascade est posée sur la grille elle-même (`RevealGroup`) et non sur des
 * enveloppes, sinon les classes `md:order-*` ne s'appliqueraient plus au bon
 * élément.
 */

const STEPS: ReadonlyArray<{ key: string; slot: ScreenshotSlotId }> = [
  { key: "write", slot: "workflowIssue" },
  { key: "run", slot: "workflowAgent" },
  { key: "review", slot: "workflowPr" },
];

export async function SectionWorkflow() {
  const t = await getTranslations("Landing");

  return (
    <section id="workflow" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
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
                <h3 className="mb-3 text-2xl font-semibold tracking-tight">
                  {t(`workflow_${step.key}_title`)}
                </h3>
                <p className="leading-relaxed text-pretty text-muted-foreground">
                  {t(`workflow_${step.key}_body`)}
                </p>
              </div>
              <ScreenshotSlot id={step.slot} className={cn(index % 2 === 1 && "md:order-1")} />
            </RevealGroup>
          ))}
        </div>
      </div>
    </section>
  );
}
