import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";

/**
 * Primitives de mise en page des pages légales (mentions, CGU, confidentialité,
 * cookies). Server-safe : aucune interactivité, ces pages sont du texte pur.
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

/** Paragraphe courant des pages légales. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground">{children}</p>;
}

/** Texte d'introduction d'une liste (un ton en dessous du corps). */
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

/** Liste à puces « terme — description », utilisée pour les données et durées. */
/**
 * Liste « terme : définition » des pages légales.
 *
 * Le séparateur suit la typographie de la langue servie : deux-points collé en
 * anglais, précédé d'une espace en français. Il était écrit en dur (`— `), ce
 * qui posait un tiret cadratin sur les trente-six entrées de la page
 * confidentialité, dans les deux langues.
 *
 * `async` plutôt qu'une prop `separator` passée par l'appelant : le composant
 * est server-safe par construction (voir l'en-tête du fichier), et la langue
 * n'est pas une décision de mise en page qui remonte à la page.
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

/** Ligne « libellé / valeur » des mentions légales. */
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

/** Lien externe des pages légales (sous-traitants, CNIL…). */
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

/** Tableau des cookies : nom, finalité, durée, avec un badge obligatoire/optionnel. */
export function CookieTable({
  caption,
  badge,
  badgeTone = "required",
  description,
  headers,
  rows,
}: {
  caption: string;
  /** Omis pour le stockage local, qui n'est pas une catégorie de consentement. */
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
      {/* Le tableau défile horizontalement sur mobile plutôt que d'élargir la page. */}
      <div className="overflow-x-auto">
        {/* Largeurs fixes : les trois tableaux de la page s'alignent entre eux. */}
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
