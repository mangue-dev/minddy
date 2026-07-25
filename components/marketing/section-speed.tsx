import { getTranslations } from "next-intl/server";
import {
  ArrowUpRight,
  Bot,
  ClipboardCopy,
  Command,
  ListChecks,
  MessagesSquare,
  Mic,
  NotebookPen,
  PencilLine,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { VoiceDictationFigure } from "./voice-dictation-figure";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";

/**
 * §3 — « Fait pour aller vite » (nouvelle section).
 *
 * La page défendait la simplicité par le nombre d'écrans, jamais par le nombre
 * de gestes. Or la fluidité est la moitié du positionnement, et elle était
 * éparpillée en trois endroits qui ne se parlaient pas : une case de grille
 * (la palette), une section pleine (la dictée), une section pleine (le carnet).
 * Les trois sont ici, dans l'ordre où on les rencontre quand on va vite : le
 * clavier d'abord, la voix quand le clavier ne suffit pas, le carnet pour ce
 * qui n'est pas encore un ticket.
 *
 * Trois blocs sous un seul H2, donc trois `h3` : la dictée et le carnet perdent
 * leur rang de section mais gardent leur ancre (`#voice`, `#scratchpad`), pour
 * que les liens du pied de page et les liens déjà partagés continuent de
 * tomber au bon endroit.
 */

/** Les trois usages de la dictée, tels que `DictateButton` est réellement monté. */
const VOICE_WAYS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "create", icon: Mic },
  { key: "edit", icon: PencilLine },
  { key: "everywhere", icon: MessagesSquare },
];

const SCRATCHPAD_POINTS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "write", icon: ListChecks },
  { key: "prompt", icon: ClipboardCopy },
  { key: "agent", icon: Bot },
  { key: "promote", icon: ArrowUpRight },
  { key: "mcp", icon: Plug },
];

export async function SectionSpeed() {
  const t = await getTranslations("Landing");

  return (
    <section
      id="speed"
      className="scroll-mt-24 border-t border-border bg-muted/20 py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("speedTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("speedSubtitle")}
          </Reveal>
        </header>

        {/* ── Le clavier ─────────────────────────────────────────────────── */}
        <RevealGroup step={0.12} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <ScreenshotSlot id="featurePalette" />
          <div>
            <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              <Command className="h-4 w-4" />
            </span>
            <h3 className="mb-3 text-2xl font-semibold tracking-tight">
              {t("feature_palette_title")}
            </h3>
            <p className="mb-4 leading-relaxed text-pretty text-muted-foreground">
              {t("feature_palette_body")}
            </p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {t("speedShortcuts")}
            </p>
          </div>
        </RevealGroup>

        {/* ── La voix ────────────────────────────────────────────────────── */}
        <div id="voice" className="mt-16 scroll-mt-24 sm:mt-24">
          <header className="mx-auto mb-10 max-w-2xl text-center">
            <Reveal
              as="span"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm"
            >
              <Mic className="h-3.5 w-3.5" />
              {t("voiceBadge")}
            </Reveal>
            <RevealHeading
              as="h3"
              className="mb-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              text={t("voiceTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="leading-relaxed text-pretty text-muted-foreground"
            >
              {t("voiceSubtitle")}
            </Reveal>
          </header>

          <Reveal>
            <VoiceDictationFigure />
          </Reveal>

          {/* Les grilles à filets (`gap-px` sur un fond `bg-border`) entrent d'un
              seul tenant : y masquer les cartes une à une laisserait voir le fond
              gris du conteneur pendant la cascade. */}
          <Reveal
            as="ul"
            className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3"
          >
            {VOICE_WAYS.map((way) => {
              const Icon = way.icon;
              return (
                <li key={way.key} className="bg-card p-6">
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h4 className="mb-1.5 font-medium">{t(`voice_${way.key}_title`)}</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`voice_${way.key}_body`)}
                  </p>
                </li>
              );
            })}
          </Reveal>

          <Reveal
            as="p"
            className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-pretty text-muted-foreground"
          >
            {t("voiceNote")}
          </Reveal>
        </div>

        {/* ── Le carnet ──────────────────────────────────────────────────── */}
        <div
          id="scratchpad"
          className="mt-16 grid scroll-mt-24 items-center gap-10 sm:mt-24 md:grid-cols-2 md:gap-16 [&>*]:min-w-0"
        >
          <div>
            <Reveal
              as="span"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm"
            >
              <NotebookPen className="h-3.5 w-3.5" />
              {t("scratchpadBadge")}
            </Reveal>

            <RevealHeading
              as="h3"
              className="mb-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              text={t("scratchpadTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="mb-8 leading-relaxed text-pretty text-muted-foreground"
            >
              {t("scratchpadSubtitle")}
            </Reveal>

            <RevealGroup as="ul" step={0.07} className="flex flex-col gap-4">
              {SCRATCHPAD_POINTS.map((point) => {
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
            </RevealGroup>
          </div>

          <Reveal delay={0.1}>
            <ScreenshotSlot id="scratchpad" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
