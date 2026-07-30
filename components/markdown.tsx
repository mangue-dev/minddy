"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "mangue-ui";
import { displayName } from "@/lib/display-name";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import type { Member } from "@/lib/types";

function memberLabel(m: Member): string {
  return displayName(m);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Minimal hast node shape — enough to walk text nodes and inject mention spans. */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/* « @numo » s'écrit comme on veut : c'est ainsi que le serveur le reconnaît
   (mentionsNumo, lib/server/assistant/comment-agent.ts). Un nom de membre, lui,
   se reconnaît à sa casse EXACTE — c'est ce que extractMentions notifie, et une
   pilule doit dire vrai sur qui a été prévenu. Deux règles, une seule passe :
   comme JS n'a pas de drapeau par branche, la casse libre de « numo » s'écrit
   lettre par lettre. */
const NUMO_PATTERN = "[Nn][Uu][Mm][Oo]";

/** Rehype plugin: turn "@Display Name" / "@numo" tokens into
    <span data-mention-*> so the renderer can swap in a MentionChip. Runs on the
    HTML AST, so surrounding markdown formatting is preserved. */
function rehypeMentions(members: Member[]) {
  const byLength = [...members].sort(
    (a, b) => memberLabel(b).length - memberLabel(a).length
  );
  const byName = new Map(byLength.map((m) => [memberLabel(m), m]));
  const names = byLength.map((m) => escapeRegExp(memberLabel(m)));
  // Sans membre, pas de branche de noms : un « (|) » vide matcherait la chaîne
  // vide, et chaque « @ » du texte deviendrait une pilule.
  const re = new RegExp(
    names.length
      ? `@(?:(${NUMO_PATTERN})\\b|(${names.join("|")}))`
      : `@(${NUMO_PATTERN})\\b`,
    "g"
  );

  const split = (value: string): HastNode[] => {
    const out: HastNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(value)) !== null) {
      const numo = !!m[1];
      // Même garde que côté serveur : « clement@numo.dev » ne cite personne.
      if (numo && m.index > 0 && !/[\s(>]/.test(value[m.index - 1])) continue;
      const member = numo ? null : byName.get(m[2]);
      if (!numo && !member) continue;
      if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
      out.push({
        type: "element",
        tagName: "span",
        properties: numo
          ? { "data-mention-type": "numo" }
          : {
              "data-mention-type": "member",
              "data-mention-id": member!.user_id,
              "data-mention-label": memberLabel(member!),
              "data-mention-seed": member!.avatar_seed,
            },
        children: [],
      });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

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
          p: (props) => <p className="my-2" {...props} />,
          a: (props) => (
            <a
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          ul: (props) => <ul className="my-2 list-disc pl-5" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal pl-5" {...props} />,
          li: (props) => <li className="my-0.5" {...props} />,
          code: (props) => (
            <code
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
              {...props}
            />
          ),
          pre: (props) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs" {...props} />
          ),
          /* GFM tables can be arbitrarily wide: keep them in their own scroll
             box so a wide one never stretches (nor side-scrolls) the comment
             around it. `min-w-max` lets the table keep its natural width inside
             that box instead of being squeezed into towering rows, while
             `w-full` still makes a small table fill the width; long cells stay
             readable by wrapping at 20rem. */
          table: (props) => (
            <div className="my-2 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
              <table
                className="w-full min-w-max border-collapse text-left text-[0.9em]"
                {...props}
              />
            </div>
          ),
          thead: (props) => <thead className="bg-muted/60" {...props} />,
          tr: (props) => (
            <tr className="border-b border-border/60 last:border-0" {...props} />
          ),
          th: (props) => (
            <th
              className="max-w-80 px-2.5 py-1.5 font-medium text-foreground"
              {...props}
            />
          ),
          td: (props) => <td className="max-w-80 px-2.5 py-1.5 align-top" {...props} />,
          h1: (props) => <h1 className="mt-3 mb-1 text-base font-semibold" {...props} />,
          h2: (props) => <h2 className="mt-3 mb-1 text-sm font-semibold" {...props} />,
          h3: (props) => <h3 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
              {...props}
            />
          ),
          strong: (props) => <strong className="font-semibold" {...props} />,
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
