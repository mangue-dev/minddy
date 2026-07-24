import { getTranslations } from "next-intl/server";
import {
  ArrowUpRight,
  Bot,
  ClipboardCopy,
  ListChecks,
  Plug,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * Le carnet de tâches — la note personnelle qui vient avant le ticket.
 *
 * Texte à gauche, capture à droite : l'inverse de la section Numo, pour que
 * deux sections en deux colonnes qui se suivent ne se ressemblent pas.
 *
 * Une icône par ligne plutôt que cinq coches identiques : les cinq points ne
 * disent pas la même chose (écrire, copier, lancer, promouvoir, MCP), et
 * l'alignement d'icônes différentes se parcourt plus vite.
 */

const POINTS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "write", icon: ListChecks },
  { key: "prompt", icon: ClipboardCopy },
  { key: "agent", icon: Bot },
  { key: "promote", icon: ArrowUpRight },
  { key: "mcp", icon: Plug },
];

export async function SectionScratchpad() {
  const t = await getTranslations("Landing");

  return (
    <section id="scratchpad" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16 [&>*]:min-w-0">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <NotebookPen className="h-3.5 w-3.5" />
              {t("scratchpadBadge")}
            </span>

            <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
              {t("scratchpadTitle")}
            </h2>
            <p className="mb-8 leading-relaxed text-pretty text-muted-foreground">
              {t("scratchpadSubtitle")}
            </p>

            <ul className="flex flex-col gap-4">
              {POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <li key={point.key} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {t(`scratchpadPoint_${point.key}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <ScreenshotSlot id="scratchpad" />
        </div>
      </div>
    </section>
  );
}
