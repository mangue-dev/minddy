import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";

/**
 * Layout primitives for legal pages (mentions, CGU, confidentiality,
 * cookies). Server-safe: no interactivity, these pages are pure text.
 */

export function LegalTitle({ title, updated }: { title: string; updated: string }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{updated}</p>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-border pb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Current paragraph of legal pages. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground">{children}</p>;
}

/** Introductory text for a list (one tone below the body). */
export function Intro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="list-outside list-disc space-y-2 pl-5 text-sm text-foreground">
      {children}
    </ul>
  );
}

/** Bulleted list “term — description”, used for data and durations. */
/**
 * “Term: definition” list of legal pages.
 *
 * The separator follows the typography of the language served: colon pasted in
 * English, preceded by a space in French. It was written in hard copy (`— `), this
 * which placed an em dash on the thirty-six entries on the page
 * confidentiality, in both languages.
 *
 * `async` rather than a passed `separator` prop by the caller: component
 * is server-safe by construction (see file header), and language
 * is not a layout decision that goes back to the page.
 */
export async function TermList({
  items,
}: {
  items: { term: string; desc: string }[];
}) {
  const locale = await getLocale();
  const separator = locale === "fr" ? " : " : ": ";

  return (
    <ul className="list-outside list-disc space-y-2 pl-5 text-sm">
      {items.map((item) => (
        <li key={item.term}>
          <span className="font-medium text-foreground">{item.term}</span>
          <span className="text-muted-foreground">
            {separator}
            {item.desc}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** “Label / value” line of the legal notices. */
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="space-y-1 text-sm">{children}</dl>;
}

/** External link to legal pages (subcontractors, CNIL, etc.). */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4 transition-colors hover:text-muted-foreground"
    >
      {children}
    </a>
  );
}

export function MailLink({ address }: { address: string }) {
  return (
    <a
      href={`mailto:${address}`}
      className="underline underline-offset-4 transition-colors hover:text-muted-foreground"
    >
      {address}
    </a>
  );
}

/** Table of cookies: name, purpose, duration, with a mandatory/optional badge. */
export function CookieTable({
  caption,
  badge,
  badgeTone = "required",
  description,
  headers,
  rows,
}: {
  caption: string;
  /** Omitted for local storage, which is not a consent category. */
  badge?: string;
  badgeTone?: "required" | "optional";
  description: string;
  headers: { name: string; purpose: string; duration: string };
  rows: { name: string; purpose: string; duration: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">{caption}</h3>
        {badge && (
          <span
            className={
              badgeTone === "required"
                ? "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
            }
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {/* The table scrolls horizontally on mobile rather than expanding the page. */}
      <div className="overflow-x-auto">
        {/* Fixed widths: the three tables on the page align with each other. */}
        <table className="w-full min-w-[32rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-[30%] py-2 pr-4 font-medium">{headers.name}</th>
              <th className="w-[47%] py-2 pr-4 font-medium">{headers.purpose}</th>
              <th className="w-[23%] py-2 font-medium">{headers.duration}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 align-top font-mono text-xs break-words text-foreground">
                  {row.name}
                </td>
                <td className="py-2 pr-4 align-top text-muted-foreground">
                  {row.purpose}
                </td>
                <td className="py-2 align-top text-muted-foreground">{row.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
