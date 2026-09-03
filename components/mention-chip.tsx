"use client";

// The pill of an “@” mention — in Numo’s dial while writing,
// in the bubble sent, and in a published comment. One and the same thing
// aux trois endroits.
//
// It shows the FIGURE of who is cited (the portrait, the orb of the project, the
// face of Numo) and her name NU: the at sign was used to call her, she no longer has
// nothing to say once the pill has been placed — exactly like a context pill
// above the composer. The “@” remains in the TEXT sent (see
// serialization of the composer, and the comment body as it is stored):
// on the model side as well as the server side, it is he who marks the mention.
//
// A pill that MEANS something — a ticket, an objective, a page, a
// project — opens with a click as soon as we give it a `href`: it then becomes
// a real anchor. A PERSON, never: minddy does not have a profile page. There
// destination rule is in lib/mention-target.ts, and that resolves it in
// components/mention-links.tsx.
//
// The pill is TINTED BY TYPE: background in color, text in the same
// color but strong, so that we read what we quote before even having read
// the wording. Only one shade per pill (`--mention-tone`), from which are deduced
// the background, its hover and the ink — see `toneStyle` below and the block
// “mention pill” from app/globals.css, which holds both themes.
//
// This is also what caused the icon patch of the ticket, the page and
// of the objective: a blue disk at 12% placed on a blue pill at 14% does not say
// nothing more than the pill, he bogs it down. The glyph is therefore NAKED, in ink
// of the pill — the pill HAS become the lozenge. What's left inside is this
// that a color cannot render: a face, an orb, an emoji.

import type { CSSProperties, MouseEvent } from "react";
import { BookText, FileText, Target } from "lucide-react";
import { cn } from "mangue-ui";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { NumoFace } from "@/components/numo-face";
import { objectiveColor } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbBaseColor } from "@/lib/project-orb-colors";
import { UserAvatar } from "@/components/user-avatar";
import { NUMO_MENTION_ID } from "@/lib/mention-attributes";

/** The id of the pseudo-entity “Numo” in the mention lists: the assistant
 is not an account, so it does not have its own id. */
export { NUMO_MENTION_ID };

/** What a mention can designate. The first four bear a FIGURE (a
 portrait, an orb, a face); ticket, objective and page do not have one — they
 take a bare glyph, in the ink of the pill. */
export type MentionChipType =
  | "member"
  | "project"
  | "numo"
  | "forge"
  | "issue"
  | "objective"
  | "page";

export function MentionChip({
  type,
  id,
  label,
  avatarSeed,
  avatarUrl,
  iconUrl,
  color,
  icon,
  href,
  onNavigate,
  className,
}: {
  type: MentionChipType;
  /** Member: user_id. Project: project id — the seed of its orb if it
 has never been revived, otherwise `avatarSeed` the door.
 Forge: the login, which is also the seed of its fallback portrait.
 Ticket and objective: their id. Numo has nothing to identify:
 `NUMO_MENTION_ID` does the trick. */
  id: string;
  label: string;
  /** Seed of the figure — the portrait of a member, the orb of a project. She
 is NOT always the id (a restarted draw, in fact). */
  avatarSeed?: string | null;
  /** Forge: the portrait served by the forge — a real face, not a seed. */
  avatarUrl?: string | null;
  /** Project: the imported favicon, when there is one. */
  iconUrl?: string | null;
  /** Objectif : SA couleur, celle que porte sa cible partout ailleurs. */
  color?: string | null;
  /** Page: her emoji, when she has one (MIN-273). */
  icon?: string | null;
  /**
 * Where does the pill lead. Present = it clicks, and becomes a real anchor:
 * ⌘-click, middle click and “open in new tab” come with it.
 * A person never has one (lib/mention-target.ts).
 */
  href?: string | null;
  /** Handles a regular click without a document reload. The destination may
   * open in place or use client-side routing. */
  onNavigate?: () => void;
  className?: string;
}) {
  // Images use the narrower left gutter; glyphs use the wider one. Every
  // measurement is relative to the label so the whole chip scales with its
  // surrounding text, including when a mention appears in a heading.
  const hasImage = type === "member" || type === "forge" || type === "project";

  // The figure stays inline with the label so the chip keeps a text baseline.
  // `align-middle` targets the x-height; the small upward offset aligns it with
  // the capitals and stems that dominate mention labels.
  const figure = (
    <span className="relative -top-[0.1em] mr-[0.3em] inline-flex size-[1.05em] items-center justify-center align-middle">
      {type === "member" ? (
        <UserAvatar seed={avatarSeed ?? id} className="size-full" />
      ) : type === "forge" ? (
        // The forge account bears HIS portrait (that of github.com), not one
        // minddy avatar generated: it's him we're quoting, and he doesn't have
        // account here. `seed` remains the fallback when the forge is not in use.
        <UserAvatar url={avatarUrl} seed={id} className="size-full" />
      ) : type === "project" ? (
        <ProjectOrb
          seed={avatarSeed ?? id}
          iconUrl={iconUrl}
          className="size-full rounded-full"
        />
      ) : type === "numo" ? (
        // The face of the assistant, exactly the one who signs his answers —
        // nude, in pill ink, which is the brand color here.
        <NumoFace className="size-full" />
      ) : type === "issue" ? (
        <FileText className="size-full" />
      ) : type === "page" ? (
        // The EMOJI of the page takes the place of the glyph when it has one:
        // it's her own face, and she wears her own colors.
        icon ? (
          <span className="text-[0.85em] leading-none">{icon}</span>
        ) : (
          <BookText className="size-full" />
        )
      ) : (
        <Target className="size-full" />
      )}
    </span>
  );

  // The chip uses its own compact, proportional line-height instead of
  // inheriting the surrounding paragraph or heading line-height. Padding and
  // radius are also expressed in em so the background grows with the label
  // without turning into a capsule.
  //
  // `inline-block align-baseline`, and above all NOT `inline-flex align-middle`:
  // a flex box does not have the baseline of its text (it takes that of
  // its first child, here a figure without text), and `align-middle` center
  // then the pill on the x-height of the paragraph. The wording is found
  // offset from the line of text surrounding it — visible from one word to another in
  // a comment. A `inline-block` takes the baseline of its
  // last line, that is to say that of the label: placed on `baseline`, it
  // falls exactly on that of the sentence. `whitespace-nowrap` goes with:
  // the space between the figure and the label must not become a point of
  // hyphenation, which the flex box prevented on its own.
  const shape = cn(
    "mx-[0.14em] inline-block whitespace-nowrap rounded-[0.35em] py-[0.07em] pr-[0.43em] align-baseline text-[0.95em] leading-[1.15] font-medium",
    hasImage ? "pl-[0.29em]" : "pl-[0.43em]",
    "bg-(--mention-chip) text-(--mention-chip-ink)",
  );

  const tone = toneStyle(type, avatarSeed ?? id, color);

  if (!href)
    return (
      <span style={tone} className={cn(shape, className)}>
        {figure}
        {label}
      </span>
    );

  return (
    // A real anchor preserves modified clicks, middle clicks, and the browser's
    // "open in new tab" command. Only an ordinary click uses `onNavigate`.
    //
    // `NODE_LINK_CLASS` tells an editor's Link extension to leave this anchor
    // alone; otherwise one click would open a new tab in addition to navigating
    // in-app (components/editor-node-link.ts). `no-underline` keeps the chip a
    // chip even inside a surrounding text surface.
    <a
      href={href}
      style={tone}
      className={cn(
        shape,
        NODE_LINK_CLASS,
        "cursor-pointer no-underline transition-colors hover:bg-(--mention-chip-hover)",
        // LAST: a caller who repaints the pill (the dark bubble of
        // cat) also repaints its hover, and tailwind-merge can only do that
        // if his class arrives after ours.
        className,
      )}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!onNavigate || !isPlainNavigationClick(event)) return;
        event.preventDefault();
        onNavigate?.();
      }}
    >
      {figure}
      {label}
    </a>
  );
}

/* ── The hue ────────────────────────────── ─────────────────────────────── */

/**
 * The color of a token type. Two of them are not tokens:
 * an objective wears ITS color (that of its target everywhere else), a project
 * the color of its orb — therefore no Tailwind classes, which are fixed at the
 * compilation. The others are tokens from app/globals.css.
 *
 * The ticket and the page keep the blue and indigo of their old pastille:
 * the color has changed support, not value. One person, one forge account
 * and Numo are NOT the same family: purple for humans, the
 * brand color for the wizard — so it says, before the wording,
 * if it calls someone or something.
 */
function mentionTone(
  type: MentionChipType,
  /** The identity that gives the color to a project: its orb seed, so that the
 pill and the orb it carries remain the same color. */
  seed: string,
  color: string | null | undefined,
): string {
  switch (type) {
    case "member":
    case "forge":
      return "var(--mention-person)";
    case "numo":
      return "var(--brand)";
    case "issue":
      return "var(--mention-issue)";
    case "page":
      return "var(--mention-page)";
    case "objective":
      // Fallback understood: a lens without color gives the gray of the text
      // secondary, therefore a gray pill — and that's right, he doesn't have one.
      return objectiveColor(color);
    case "project":
      // The EXACT solid color of the orb, not an approximation: the pill and the
      // pastille she wears are side by side, a gap in clarity between the
      // deux se verrait.
      return projectOrbBaseColor(seed);
  }
}

/**
 * The three variables the pill reads, derived from its hue. The background and
 * ink are the SAME color rested at two lightnesses: the background to that which
 * sinks into the page, the ink to that which is read on it. It is the syntax
 * relative color that allows this — `oklch(from …)` takes the hue and the
 * saturation of any color (a hexadecimal from the base, also
 * although a token) and replaces only the lightness.
 *
 * Lightness and opacities live in app/globals.css: they are not
 * are not the same in light theme and dark theme, and a value written
 * here would not know which of the two reads it.
 */
function toneStyle(
  type: MentionChipType,
  /** Cf. `mentionTone`: the seed, not the id — a project whose circulation has been relaunched
 must dye its pill its NEW color. */
  seed: string,
  color: string | null | undefined,
): CSSProperties {
  const tone = mentionTone(type, seed, color);
  return {
    "--mention-chip": `oklch(from ${tone} var(--mention-chip-l) c h / var(--mention-chip-a))`,
    "--mention-chip-hover": `oklch(from ${tone} var(--mention-chip-l) c h / var(--mention-chip-a-hover))`,
    "--mention-chip-ink": `oklch(from ${tone} var(--mention-chip-ink-l) c h)`,
  } as CSSProperties;
}
