import { getTranslations } from "next-intl/server";
import { MessagesSquare, Mic, PencilLine, type LucideIcon } from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * La dictée vocale — l'argument qui manquait à la page.
 *
 * Bande légèrement teintée : c'est la seule section qui rompt le rythme
 * bord-à-bord de la landing, parce que c'est la promesse la plus inattendue et
 * qu'elle ne doit pas se lire comme une fonctionnalité de plus.
 *
 * Rien n'est promis au-delà de ce que fait le produit : le micro existe partout
 * où `DictateButton` est monté (création et détail de ticket, commentaires,
 * pull request, carnet, champ de Numo), et la limite de 1 min 30 est celle du
 * composant (`MAX_DURATION_MS`).
 */

const WAYS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "create", icon: Mic },
  { key: "edit", icon: PencilLine },
  { key: "everywhere", icon: MessagesSquare },
];

export async function SectionVoice() {
  const t = await getTranslations("Landing");

  return (
    <section
      id="voice"
      className="scroll-mt-24 border-t border-border bg-muted/20 py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Mic className="h-3.5 w-3.5" />
            {t("voiceBadge")}
          </span>
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("voiceTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("voiceSubtitle")}
          </p>
        </header>

        <ScreenshotSlot id="voiceDictate" />

        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:mt-16 md:grid-cols-3">
          {WAYS.map((way) => {
            const Icon = way.icon;
            return (
              <li key={way.key} className="bg-card p-6">
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="mb-1.5 font-medium">{t(`voice_${way.key}_title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`voice_${way.key}_body`)}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-pretty text-muted-foreground">
          {t("voiceNote")}
        </p>
      </div>
    </section>
  );
}
