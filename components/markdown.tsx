"use client";

import { useMemo, type ElementType, type JSX } from "react";
import ReactMarkdown, { type ExtraProps, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "mangue-ui";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import {
  memberLabel,
  mentionScanner,
  type MentionScan,
} from "@/lib/mention-scan";
import { forgeImageSrc } from "@/lib/forge-image-assets";
import { usePrEndpoint } from "@/lib/pr-endpoint-context";
import type { Member } from "@/lib/types";

/* Minimal hast node shape — enough to walk text nodes and inject mention spans. */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Rehype plugin: turn "@Display Name" / "@numo" / "@MIN-42" tokens into
    <span data-mention-*> so the renderer can swap in a MentionChip. Runs on the
    HTML AST, so surrounding markdown formatting is preserved. The rule of this
    which IS a mention comes from lib/mention-scan — the same one that applies the field
    while we write. */
function rehypeMentions(scan: MentionScan) {
  const split = (value: string): HastNode[] =>
    scan(value).map((seg) => {
      if (seg.mention === undefined) return { type: "text", value: seg.text };
      const mention = seg.mention;
      // `member` in test, and not “not numo”: the scanner also knows how to render
      // FORGE accounts (MIN-162), which no list of minddy members produces
      // here — a ticket comment only quotes people from here. Ticket and
      // objective do not succeed either: it is the scanner of a DESCRIPTION
      // who produces them, and a description goes to its editor.
      const properties =
        mention.type === "member"
          ? {
              "data-mention-type": "member",
              "data-mention-id": mention.member.user_id,
              "data-mention-label": memberLabel(mention.member),
              "data-mention-seed": mention.member.avatar_seed,
            }
          : { "data-mention-type": "numo" };
      return { type: "element", tagName: "span", properties, children: [] };
    });

  const walk = (node: HastNode) => {
    if (!node.children) return;
    // Code is quoted literally: “`@numo`” shows the gesture to be made, it does not
    // doesn't do it.
    if (node.tagName === "code" || node.tagName === "pre") return;
    const next: HastNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes("@")) {
        next.push(...split(child.value));
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };

  return () => (tree: HastNode) => walk(tree);
}

/**
 * A beacon rendered as is, just dressed up.
 *
 * react-markdown ALWAYS passes the hast node as a prop to a component
 * replacement (`passNode: true`, hardcoded — there is no option to
 * turn it off). Left in the spread, it ends up in the DOM: each paragraph,
 * every cell and every comment title carried an attribute
 * `node="[object Object]"`. He retires here, once and for all, rather than in
 * fifteen closures which would repeat the same destructuring.
 */
function styled<T extends keyof JSX.IntrinsicElements>(tag: T, className: string) {
  const Tag = tag as ElementType;
  return function Styled({ node, ...props }: JSX.IntrinsicElements[T] & ExtraProps) {
    return <Tag className={className} {...props} />;
  };
}

/**
 * Rehype string, in an ORDER which is a security property. The path
 * normal deliberately does not connect `rehypeRaw`: HTML tags pasted
 * in a comment remain text, and never become nodes.
 * `allowRawHtml` is an explicit gate for a surface that would have a reason
 * of distinct trust. The sanitizer comes before the mentions in both
 * case, so that a handwritten `data-mention-*` does not pass itself off as
 * a real mention.
 */
function rehypeChain(
  scan: MentionScan | undefined,
  allowRawHtml: boolean,
): Options["rehypePlugins"] {
  const chain: NonNullable<Options["rehypePlugins"]> = allowRawHtml
    ? [rehypeRaw, [rehypeSanitize, defaultSchema]]
    : [[rehypeSanitize, defaultSchema]];
  return scan ? [...chain, rehypeMentions(scan)] : chain;
}

/** Renders markdown (GFM) with minimal, token-aware styling. Raw HTML is kept
    as text by default; callers that intentionally display trusted forge HTML
    can opt in with `allowRawHtml`.
    Pass `members` to render "@Name" and "@numo" mentions as chips — the same
    chip as the Numo composer's (components/mention-chip). The array may be
    empty: it says "this surface carries mentions", and "@numo" is citable there
    even when nobody else is.
    A comment only quotes PEOPLE: tickets and objectives do not
    cite that in a description, which does not have read-only rendering — its
    display surface IS its editor (components/markdown-editor), where the
    pills come from the tiptap node. */
export function Markdown({
  children,
  className,
  members,
  allowRawHtml = false,
}: {
  children: string;
  className?: string;
  members?: Member[];
  /** Deliberately opt-in: user-authored comments must not execute/render HTML. */
  allowRawHtml?: boolean;
}) {
  // null outside of a PR view: images in a ticket comment are already
  // served by minddy, they have nothing to proxify.
  const imageEndpoint = usePrEndpoint();
  // No members = surface without mentions: the rehype channel stops at
  // sanitizer, and a “@something” remains there.
  const scan = useMemo(
    () => (members ? mentionScanner(members) : undefined),
    [members],
  );
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className
      )}
    >
      <ReactMarkdown
        // `remarkBreaks`: a single newline IS a newline.
        // This is the rule for GitHub comments (not for .md files), and
        // it's that of all the surfaces here — ticket comments, PR,
        // plans. Without it, a message written in three lines would be delivered in just one
        // paragraph: the most visible difference in “text rendering”.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={rehypeChain(scan, allowRawHtml)}
        components={{
          p: styled("p", "my-3"),
          a: ({ node, ...props }) => (
            <a
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          /* A nested list gets tighter (`[&_ul]`, `[&_ol]`): spacing
             between paragraphs would cascade into a list that falls apart. */
          ul: styled("ul", "my-3 list-disc pl-5 [&_ol]:my-1 [&_ul]:my-1"),
          ol: styled("ol", "my-3 list-decimal pl-5 [&_ol]:my-1 [&_ul]:my-1"),
          /* A check box replaces the chip and is placed in the gutter,
             like at GitHub — otherwise the line carries both. The selector is
             STRUCTURAL (`:has`) rather than based on class `task-list-item`,
             that the sanitizer removes. The only `input` that it lets pass is
             precisely a disabled checkbox: no ambiguity. */
          li: styled("li", "my-1 [&:has(>input)]:list-none [&>input]:-ml-5"),
          input: styled(
            "input",
            "mr-1.5 inline-block size-3.5 translate-y-[0.15em] accent-primary",
          ),
          code: styled("code", "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"),
          pre: styled("pre", "my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs"),
          kbd: styled(
            "kbd",
            "rounded border border-border bg-muted px-1 font-mono text-[0.85em]",
          ),
          /* Comment images (CI badges, pasted captures): they are coming
             especially in raw HTML, and therefore did not render at all before
             `rehypeRaw`. Bounded to the width of the wire — a retinal capture
             would push the map off the screen.

             A capture pasted on the forge goes through the PR proxy
             quand on nous a dit de quelle PR ce texte vient : son URL d'origine
             responds 404 to who does not have a GitHub session (MIN-162). The gesture is
             the same for a markdown tag and for a raw `<img>` — both
             arrive here, after `rehypeRaw`. */
          img: ({ node, ...props }) => (
            <img
              className="inline-block max-w-full rounded-md"
              loading="lazy"
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              {...props}
              src={
                imageEndpoint && typeof props.src === "string"
                  ? forgeImageSrc(props.src, imageEndpoint)
                  : props.src
              }
            />
          ),
          details: styled("details", "my-3"),
          summary: styled("summary", "cursor-pointer font-medium"),
          /* GFM tables can be arbitrarily wide: keep them in their own scroll
             box so a wide one never stretches (nor side-scrolls) the comment
             around it. `min-w-max` lets the table keep its natural width inside
             that box instead of being squeezed into towering rows, while
             `w-full` still makes a small table fill the width; long cells stay
             readable by wrapping at 20rem. */
          table: ({ node, ...props }) => (
            <div className="my-3 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
              <table
                className="w-full min-w-max border-collapse text-left text-[0.9em]"
                {...props}
              />
            </div>
          ),
          thead: styled("thead", "bg-muted/60"),
          tr: styled("tr", "border-b border-border/60 last:border-0"),
          th: styled("th", "max-w-80 px-2.5 py-1.5 font-medium text-foreground"),
          td: styled("td", "max-w-80 px-2.5 py-1.5 align-top"),
          /* Six levels, and a ladder that IS SEEN — the three old ones fell
             all between 14 and 16 px, which made it read a plan or a summary of
             review as a flat block. The sizes are in `em` (and not in steps
             Tailwind) to remain relative to the body of the text: a surface which
             reduces its base reduces its titles with it. The proportions are
             those of GitHub, tightened: on a body at 14 px, the 2nd of its h1
             would go beyond the title of the page. */
          h1: styled("h1", "mt-5 mb-2 text-[1.5em] leading-tight font-semibold"),
          h2: styled("h2", "mt-5 mb-2 text-[1.3em] leading-tight font-semibold"),
          h3: styled("h3", "mt-4 mb-2 text-[1.15em] leading-snug font-semibold"),
          h4: styled("h4", "mt-4 mb-2 text-[1em] font-semibold"),
          h5: styled("h5", "mt-4 mb-2 text-[0.9em] font-semibold"),
          h6: styled("h6", "mt-4 mb-2 text-[0.85em] font-semibold text-muted-foreground"),
          blockquote: styled(
            "blockquote",
            "my-3 border-l-2 border-border pl-3 text-muted-foreground"
          ),
          strong: styled("strong", "font-semibold"),
          hr: () => <hr className="my-4 border-border" />,
          span: ({ node, ...props }) => {
            const p = node?.properties ?? {};
            const type = p["data-mention-type"] as string | undefined;
            if (type === "numo") {
              return <MentionChip type="numo" id={NUMO_MENTION_ID} label="Numo" />;
            }
            if (type === "member") {
              return (
                <MentionChip
                  type="member"
                  id={p["data-mention-id"] as string}
                  label={p["data-mention-label"] as string}
                  avatarSeed={p["data-mention-seed"] as string}
                />
              );
            }
            return <span {...props} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
