"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { CopyButton } from "@/components/marketing/copy-button";

type Props = {
  title: string;
  body: string;
  prompt: string;
  pageUrl: string;
  claudeLabel: string;
  codexLabel: string;
  copyLinkLabel: string;
  copiedLabel: string;
};

/** Opens a new assistant chat with a concise, localized self-hosting brief. */
export function SelfHostingAiActions({
  title,
  body,
  prompt,
  pageUrl,
  claudeLabel,
  codexLabel,
  copyLinkLabel,
  copiedLabel,
}: Props) {
  const assistants = [
    {
      label: claudeLabel,
      href: `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`,
      logo: "/agents/claude.svg",
    },
    {
      label: codexLabel,
      href: `codex://new?prompt=${encodeURIComponent(prompt)}`,
      logo: "/agents/codex-light.svg",
      darkLogo: "/agents/codex-dark.svg",
    },
  ];

  return (
    <section className="border-y border-border bg-muted/20 py-12 sm:py-14">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {assistants.map(({ label, href, logo, darkLogo }) => (
              <a
                key={label}
                href={href}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <img src={logo} alt="" aria-hidden className={darkLogo ? "h-4 w-4 object-contain dark:hidden" : "h-4 w-4 object-contain"} />
                {darkLogo && <img src={darkLogo} alt="" aria-hidden className="hidden h-4 w-4 object-contain dark:block" />}
                {label}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </a>
            ))}
            <CopyButton
              text={pageUrl}
              label={copyLinkLabel}
              copiedLabel={copiedLabel}
              className="rounded-full px-3.5 py-2 text-sm text-foreground hover:bg-muted"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
