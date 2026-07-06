"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "mangue-ui";
import { avatarColor, initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
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

/** Rehype plugin: turn "@Display Name" tokens (matching known members) into
    <span class="mention" data-user-id> so the renderer can show a badge. Runs on
    the HTML AST, so surrounding markdown formatting is preserved. */
function rehypeMentions(members: Member[]) {
  const byLength = [...members].sort(
    (a, b) => memberLabel(b).length - memberLabel(a).length
  );
  const idByName = new Map(byLength.map((m) => [memberLabel(m), m.user_id]));
  const pattern = byLength.map((m) => escapeRegExp(memberLabel(m))).join("|");
  const re = pattern ? new RegExp(`@(${pattern})`, "g") : null;

  const split = (value: string): HastNode[] => {
    if (!re) return [{ type: "text", value }];
    const out: HastNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(value)) !== null) {
      if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
      out.push({
        type: "element",
        tagName: "span",
        properties: { className: ["mention"], "data-user-id": idByName.get(m[1]) },
        children: [{ type: "text", value: m[1] }],
      });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  };

  const walk = (node: HastNode) => {
    if (!node.children) return;
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

  return () => (tree: HastNode) => {
    if (re) walk(tree);
  };
}

function MentionBadge({ userId, members }: { userId: string; members: Member[] }) {
  const m = members.find((x) => x.user_id === userId);
  const name = m ? memberLabel(m) : "Utilisateur";
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1.5 pl-0.5 align-baseline text-[0.9em] font-medium text-primary">
      <span
        className="flex size-4 items-center justify-center rounded-full text-[8px] font-semibold text-white"
        style={{ backgroundColor: avatarColor(userId) }}
        aria-hidden
      >
        {initials(name)}
      </span>
      @{name}
    </span>
  );
}

/** Renders markdown (GFM) with minimal, token-aware styling — no raw HTML.
    Pass `members` to render "@Name" mentions as avatar badges. */
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
        rehypePlugins={members && members.length ? [rehypeMentions(members)] : []}
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
            const uid = node?.properties?.["data-user-id"] as string | undefined;
            if (uid && members) return <MentionBadge userId={uid} members={members} />;
            return <span {...props} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
