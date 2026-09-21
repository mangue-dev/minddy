"use client";

import { useState, type FormEvent } from "react";

/** The pages that carry a FAQ section, mirroring `FAQ_SECTIONS` on the server. */
export type FaqAskSection = "landing" | "pricing" | "mcp";

export interface FaqAskStrings {
  placeholder: string;
  submitAria: string;
  loading: string;
  error: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answered"; answer: string }
  | { kind: "failed" };

/**
 * The question box of a FAQ section (MIN-590), rendered as the LAST ROW of
 * the accordion (`FaqAccordion`'s trailing child): not collapsible, no
 * chevron, no card, no button — just the question typed in place, styled
 * like a trigger (`py-6 text-base font-medium`, transparent border, the
 * trigger's focus ring), and the answer written underneath exactly like an
 * accordion answer (`text-sm leading-relaxed text-muted-foreground`).
 *
 * It sits inside the accordion root so the separators stay honest: the last
 * FAQ item reads `not-last:border-b` against it and closes the list above
 * the input. The strings cross as props, not through `useTranslations`:
 * this is a marketing page, and the public browser feed carries only the
 * whitelisted namespaces (`lib/public-client-messages.ts`) — same envelope
 * as the dictation demo.
 */
export function FaqAsk({
  section,
  locale,
  strings,
}: {
  section: FaqAskSection;
  locale: string;
  strings: FaqAskStrings;
}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || status.kind === "loading") return;
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/faq/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, section, locale }),
      });
      const data = (await res.json().catch(() => null)) as
        | { answer?: string }
        | null;
      if (res.ok && typeof data?.answer === "string" && data.answer) {
        setStatus({ kind: "answered", answer: data.answer });
        setQuestion("");
      } else {
        setStatus({ kind: "failed" });
      }
    } catch {
      setStatus({ kind: "failed" });
    }
  };

  return (
    <div data-slot="faq-ask">
      <form onSubmit={(event) => void ask(event)}>
        <input
          value={question}
          placeholder={strings.placeholder}
          maxLength={500}
          autoComplete="off"
          disabled={status.kind === "loading"}
          className="w-full rounded-lg border border-transparent bg-transparent py-6 text-base font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          onChange={(event) => setQuestion(event.target.value)}
        />
        {/* Implicit submission: Enter asks. The sr-only submit keeps the
            gesture working on browsers that require a submit button. */}
        <button type="submit" className="sr-only">
          {strings.submitAria}
        </button>
      </form>
      <div aria-live="polite">
        {status.kind === "loading" ? (
          <p className="pb-6 text-sm leading-relaxed text-muted-foreground">
            {strings.loading}
          </p>
        ) : null}
        {status.kind === "answered" ? (
          <p className="pb-6 text-sm leading-relaxed text-muted-foreground">
            {status.answer}
          </p>
        ) : null}
        {status.kind === "failed" ? (
          <p className="pb-6 text-sm leading-relaxed text-destructive">
            {strings.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
