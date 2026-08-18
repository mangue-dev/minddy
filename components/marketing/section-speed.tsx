import { getTranslations } from "next-intl/server";
import {
  ArrowUpRight,
  Bot,
  ClipboardCopy,
  ListChecks,
  Mic,
  NotebookPen,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { VoiceDemo } from "./voice-demo";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §3 — “Made to go fast” (new section).
 *
 * The page defended simplicity by the number of screens, never by the number
 * of gestures. Now fluidity is half of the positioning, and it was
 * scattered in three places which did not speak to each other: a grid square
 * (the palette), a full section (the dictation), a full section (the notebook).
 * The three are here, in the order in which we encounter them when we go fast: the
 * keyboard first, the voice when the keyboard is not enough, the notebook for this
 * which is not yet a ticket.
 *
 * Three blocks under a single H2, therefore three `h3`: the dictation and the notebook lose
 * their section rank but keep their anchor (`#voice`, `#scratchpad`), so that
 * footer links and already shared links continue to fall in the correct place.
 */

/** The three uses of dictation, such as `DictateButton` is actually mounted. */
const VOICE_WAYS = [
  { key: "create", icon: "mic" },
  { key: "edit", icon: "pencil" },
  { key: "everywhere", icon: "message" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

const SCRATCHPAD_POINTS = [
  { key: "write", icon: ListChecks },
  { key: "prompt", icon: ClipboardCopy },
  { key: "agent", icon: Bot },
  { key: "promote", icon: ArrowUpRight },
  { key: "mcp", icon: Plug },
] as const satisfies ReadonlyArray<{ key: string; icon: LucideIcon }>;

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

        {/* ── The keyboard ───────────────────────── ────────────────────────── */}
        <RevealGroup step={0.12} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <ScreenshotSlot id="featurePalette" />
          <div>
            <IsoTile name="command" className="mb-4 w-14" />
            <h3 className="mb-3 text-2xl font-semibold tracking-tight">
              {t("feature_palette_title")}
            </h3>
            {/* The list of shortcuts (“G then I”, “⇧V”…) has been skipped: the
 visitor who does not know Minddy wants to know what we gain,
 not which key to press. Shortcuts are learned in
 the app, where they are displayed next to each action. */}
            <p className="leading-relaxed text-pretty text-muted-foreground">
              {t("feature_palette_body")}
            </p>
          </div>
        </RevealGroup>

        {/* ── The voice ─────────────────────────── ─────────────────────────── */}
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

          {/* Playable, not illustrated (MIN-150): the visitor speaks and watches the
 fields fill up. The static figure who held this place
 said the same thing without making it felt. */}
          <Reveal>
            <VoiceDemo />
          </Reveal>

          {/* The net grids (`gap-px` on a `bg-border` background) enter as a single piece: hiding the cards one by one would reveal the gray
 background of the container during the cascade. */}
          <Reveal
            as="ul"
            className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3"
          >
            {VOICE_WAYS.map((way) => (
              <li key={way.key} className="bg-card p-6">
                <IsoTile name={way.icon} className="mb-4 w-14" />
                <h4 className="mb-1.5 font-medium">{t(`voice_${way.key}_title`)}</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`voice_${way.key}_body`)}
                </p>
              </li>
            ))}
          </Reveal>
        </div>

        {/* ── The notebook ────────────────────────── ────────────────────────── */}
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
