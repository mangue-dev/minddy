import { getTranslations } from "next-intl/server";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { ScreenshotSlot } from "@/components/marketing/screenshot-slot";
import type { ScreenshotSlotId } from "@/components/marketing/screenshot-slots";
import type { MessageKey } from "@/lib/i18n-keys";
import { cn } from "@/lib/utils";

/**
 * The features the showcase takes turns presenting, each with the landing's
 * reviewed title and line for it and the tone of its landing card. Every slot
 * here has a published capture in each locale and theme.
 */
export const AUTH_SHOWCASES = [
  { slot: "heroBoard", title: "navMenu_tracker_title", body: "feature_board_body", tone: "sage" },
  { slot: "pagesEditor", title: "pagesTitle", body: "pages_write_body", tone: "lavender" },
  { slot: "numoPanel", title: "numoTitle", body: "numoSubtitle", tone: "sky" },
  { slot: "feedbackBoard", title: "navMenu_feedback_title", body: "feedbackSubtitle", tone: "peach" },
  { slot: "featurePalette", title: "feature_palette_title", body: "feature_palette_body", tone: "butter" },
  { slot: "scratchpad", title: "scratchpadTitle", body: "scratchpadSubtitle", tone: "rose" },
] as const satisfies ReadonlyArray<{
  slot: ScreenshotSlotId;
  title: MessageKey<"Landing">;
  body: MessageKey<"Landing">;
  tone: keyof typeof CARD_TONES;
}>;

/**
 * The pane beside the auth forms on wide screens (MIN-781).
 *
 * It sits NEXT to the form, never behind it: `auth-shell.tsx` explains why a
 * decoration under a password field was withdrawn. Each visit shows another
 * feature of the product with its localized capture, so the door of the app
 * also says what is behind it. Below 1024px it disappears and the form keeps
 * the whole screen.
 *
 * The capture is decoration here: not selectable, not draggable, and hidden
 * from assistive technology like the rest of the pane.
 */
export async function AuthShowcase({ pick = Math.random() }: { pick?: number }) {
  const t = await getTranslations("Landing");
  const showcase = AUTH_SHOWCASES[Math.floor(pick * AUTH_SHOWCASES.length) % AUTH_SHOWCASES.length];
  return (
    <aside
      aria-hidden="true"
      data-showcase={showcase.slot}
      className="hidden w-[52%] max-w-[860px] shrink-0 p-3 pl-0 select-none desktop:flex"
    >
      <div
        className={cn(
          "auth-showcase-enter relative flex flex-1 flex-col overflow-hidden rounded-[var(--app-pane-radius)]",
          CARD_TONES[showcase.tone],
        )}
      >
        <div
          className="hero-reveal max-w-lg px-12 pt-16"
          style={{ "--hero-d": 0.3 } as React.CSSProperties}
        >
          <p className="text-[clamp(1.75rem,2.5vw,2.5rem)] font-medium leading-[1.08] tracking-[-0.045em] text-balance">
            {t(showcase.title)}
          </p>
          <p className="mt-4 line-clamp-3 text-base leading-relaxed text-pretty opacity-70">
            {t(showcase.body)}
          </p>
        </div>
        <div
          className="hero-reveal hero-reveal-media relative mt-10 min-h-0 flex-1"
          style={{ "--hero-d": 0.45 } as React.CSSProperties}
        >
          {/* Bleeds off the right and bottom edges: a window onto the
              product, not a framed thumbnail. */}
          <div className="pointer-events-none absolute top-0 left-12 w-[1040px] [&_img]:select-none" draggable={false}>
            <ScreenshotSlot
              id={showcase.slot}
              sizes="1040px"
              className="rounded-sm shadow-lg shadow-black/10"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
