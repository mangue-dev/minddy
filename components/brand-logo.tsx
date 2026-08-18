import { cn } from "mangue-ui/lib/utils";

/** A third-party brand bears its logo and, when it is monochrome, its variant
 for dark background. The two registers that have one — the MCP
 (`lib/mcp-agents.ts`) agents and the tools from which a backlog is imported
 (`lib/import-guides.ts`) — satisfy this form. */
export interface BrandMark {
  /** Logo for light theme (public/). */
  logo: string;
  /** Dark theme variant, for monochrome brands. */
  logoDark?: string;
}

/** Logo of a third party brand, with light/dark toggle when a variant exists.
 Deliberately WITHOUT "use client": used both in server
 components (OAuth pages) and in client components (settings) — and
 the McpAgent object carries a non-serializable build() function border
 RSC, so only the bare essentials cross.

 `loading="lazy"`, and this is not a comfort detail (MIN-100). React 19
 PRELOAD from the header any `<img>` encountered in server rendering which is
 not lazy: the window of the landing agents — nine logos, duplicate
 when there is a dark variant — therefore posed eighteen
 `<link rel="preload" as="image">` in the `<head>`, all ahead of the capture of the
 hero, which is the LCP element. None of these logos are on the first screen; a
 logo in the viewport (OAuth page, settings) loads
 immediately anyway, `lazy` or not. */
export function BrandLogo({ brand, className }: { brand: BrandMark; className?: string }) {
  if (!brand.logoDark) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logo} alt="" aria-hidden loading="lazy" className={className} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.logo}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(className, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.logoDark}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
