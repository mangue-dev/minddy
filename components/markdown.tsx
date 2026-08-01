"use client";

import type { ElementType, JSX } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "mangue-ui";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import { memberLabel, mentionScanner } from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

/* Minimal hast node shape — enough to walk text nodes and inject mention spans. */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Rehype plugin: turn "@Display Name" / "@numo" tokens into
    <span data-mention-*> so the renderer can swap in a MentionChip. Runs on the
    HTML AST, so surrounding markdown formatting is preserved. La règle de ce
    qui EST une mention vient de lib/mention-scan — la même qu'applique le
    composer pendant qu'on écrit. */
function rehypeMentions(members: Member[]) {
  const scan = mentionScanner(members);

  const split = (value: string): HastNode[] =>
    scan(value).map((seg) =>
      seg.mention === undefined
        ? { type: "text", value: seg.text }
        : {
            type: "element",
            tagName: "span",
            properties:
              seg.mention.type === "numo"
                ? { "data-mention-type": "numo" }
                : {
                    "data-mention-type": "member",
                    "data-mention-id": seg.mention.member.user_id,
                    "data-mention-label": memberLabel(seg.mention.member),
                    "data-mention-seed": seg.mention.member.avatar_seed,
                  },
            children: [],
          },
    );

  const walk = (node: HastNode) => {
    if (!node.children) return;
    // Du code se cite littéralement : « `@numo` » montre le geste à faire, il ne
    // le fait pas.
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
 * Une balise rendue telle quelle, juste habillée.
 *
 * react-markdown passe TOUJOURS le nœud hast en prop à un composant de
 * remplacement (`passNode: true`, codé en dur — il n'y a pas d'option pour
 * l'éteindre). Laissé dans le spread, il finit dans le DOM : chaque paragraphe,
 * chaque cellule, chaque titre d'un commentaire portait un attribut
 * `node="[object Object]"`. Il se retire ici, une bonne fois, plutôt que dans
 * quinze fermetures qui répéteraient la même destructuration.
 */
function styled<T extends keyof JSX.IntrinsicElements>(tag: T, className: string) {
  const Tag = tag as ElementType;
  return function Styled({ node, ...props }: JSX.IntrinsicElements[T] & ExtraProps) {
    return <Tag className={className} {...props} />;
  };
}

/** Renders markdown (GFM) with minimal, token-aware styling — no raw HTML.
    Pass `members` to render "@Name" and "@numo" mentions as chips — the same
    chip as the Numo composer's (components/mention-chip). The array may be
    empty: it says "this surface carries mentions", and "@numo" is citable there
    even when nobody else is. */
export function Markdown({
  children,
  className,
  members,
}: {
  children: string;
  className?: string;
  members?: Member[];
}) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={members ? [rehypeMentions(members)] : []}
        components={{
          p: styled("p", "my-2"),
          a: ({ node, ...props }) => (
            <a
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          ul: styled("ul", "my-2 list-disc pl-5"),
          ol: styled("ol", "my-2 list-decimal pl-5"),
          li: styled("li", "my-0.5"),
          code: styled("code", "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"),
          pre: styled("pre", "my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs"),
          /* GFM tables can be arbitrarily wide: keep them in their own scroll
             box so a wide one never stretches (nor side-scrolls) the comment
             around it. `min-w-max` lets the table keep its natural width inside
             that box instead of being squeezed into towering rows, while
             `w-full` still makes a small table fill the width; long cells stay
             readable by wrapping at 20rem. */
          table: ({ node, ...props }) => (
            <div className="my-2 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
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
          h1: styled("h1", "mt-3 mb-1 text-base font-semibold"),
          h2: styled("h2", "mt-3 mb-1 text-sm font-semibold"),
          h3: styled("h3", "mt-2 mb-1 text-sm font-semibold"),
          blockquote: styled(
            "blockquote",
            "my-2 border-l-2 border-border pl-3 text-muted-foreground"
          ),
          strong: styled("strong", "font-semibold"),
          hr: () => <hr className="my-3 border-border" />,
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
