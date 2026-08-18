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

/** The id of the pseudo-entity “Numo” in the mention lists: the assistant
 is not an account, so it does not have its own id. */
export const NUMO_MENTION_ID = "__numo__";

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
  /** The REGULAR click: application navigation, so as not to reload the entire
 page. Without it, the anchor is tracked by the browser. */
  onNavigate?: () => void;
  className?: string;
}) {
  // An IMAGE (a portrait, an orb) is an object in the line; a GLYPH
  // is text — it lives in the margin of the label and follows its color. Hence
  // two gutters on the left, and only one on the right.
  //
  // Both images are ROUND and the size of a glyph (14px), not the
  // height of the line: a mention is first read by its wording, the figure
  // is only there to say who it is when two people have the same
  // first name. At 16px it weighed more than the name it accompanies. Round, y
  // understood the orb of the project: at this size a softened square is only one
  // bumpy round, and the pill already has the rectangular shape for two.
  const hasImage = type === "member" || type === "forge" || type === "project";

  // The figure is an object placed IN the text line of the pill, and not a
  // brother of the wording in a flex box: this is what allows the pill
  // to have a baseline (see `shape`). It therefore focuses on the height
  // d'x of the label (`align-middle`), like an emoticon would do.
  //
  // …and then goes up a tenth of an em, because it is NOT on the
  // height of x as the eye wants it. `align-middle` aims for the middle of the “x”;
  // but a mention wording is made up of capitals and stems (“Clément”,
  // “PRTF-2”), whose optical medium is that of the height of the capital,
  // higher by approximately (cap − x) / 2 — or ~0.1em for Inter. Without this
  // shift the figure appears to fall under its own text, inside the
  // pill. In `em` and not in pixels: the pill follows the body of the text which
  // door, its timing must follow it too.
  const figure = (
    <span className="relative -top-[0.1em] mr-1 inline-flex size-3.5 items-center justify-center align-middle">
      {type === "member" ? (
        <UserAvatar seed={avatarSeed ?? id} className="size-3.5" />
      ) : type === "forge" ? (
        // The forge account bears HIS portrait (that of github.com), not one
        // minddy avatar generated: it's him we're quoting, and he doesn't have
        // account here. `seed` remains the fallback when the forge is not in use.
        <UserAvatar url={avatarUrl} seed={id} className="size-3.5" />
      ) : type === "project" ? (
        <ProjectOrb
          seed={avatarSeed ?? id}
          iconUrl={iconUrl}
          className="size-3.5 rounded-full"
        />
      ) : type === "numo" ? (
        // The face of the assistant, exactly the one who signs his answers —
        // nude, in pill ink, which is the brand color here.
        <NumoFace className="size-3.5" />
      ) : type === "issue" ? (
        <FileText className="size-3.5" />
      ) : type === "page" ? (
        // The EMOJI of the page takes the place of the glyph when it has one:
        // it's her own face, and she wears her own colors.
        icon ? (
          <span className="text-[0.85em] leading-none">{icon}</span>
        ) : (
          <BookText className="size-3.5" />
        )
      ) : (
        <Target className="size-3.5" />
      )}
    </span>
  );

  // Geometry of the pill, in the order in which it is deduced:
  // it is the LABEL which gives the height (leading-4, i.e. 16px), and not more
  // the figure, which is now smaller: + 1px margin at the top and
  //   en bas → 18px ;
  // radius 5px, and not half the height: a barely softened RECTANGLE,
  // not a capsule. This is what makes it look like text highlighting
  // rather than an object placed on it — a mention is of the cited text, it
  // has no reason to break away from it in form.
  //
  // The vertical margin is no longer worth the 3px of a pill with a neutral background: one
  // TINTED pill can be seen on its own, it no longer needs to deviate from the
  // text to exist. 18px high on a 14px body, that's a line of
  // barely thickened text — what a mention should be.
  //
  // `leading-4` is not cosmetic: without it the wording keeps the line spacing
  // text surrounding it (leading-relaxed, ~23px) and the pill grows in size
  // height ONLY — the bottom and top 1px would then appear 4px.
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
    "mx-0.5 inline-block whitespace-nowrap rounded-[5px] py-px pr-1.5 align-baseline text-[0.95em] font-medium leading-4",
    // An image no longer goes down to the edge: at 14px in a box of 16,
    // it no longer fills the gutter, a 1px would stick it to the corner.
    hasImage ? "pl-1" : "pl-1.5",
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
    // A real anchor, not a clickable pill: ⌘-click, middle click and
    // "open in new tab" come with it, and no `onClick` knows
    // redo them. The ORDINARY click goes through the router.
    //
    // `NODE_LINK_CLASS`: in a publisher, this is the mark by which
    // l'extension Link laisse l'ancre tranquille — sans elle, un clic ouvrait un
    // new tab IN ADDITION to navigation (components/editor-node-link.ts).
    // `no-underline` goes with it: the text surfaces paint their links, and
    // an underlined pill is no longer a pill.
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
