"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "mangue-ui";

/** Renders markdown (GFM) with minimal, token-aware styling — no raw HTML. */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
