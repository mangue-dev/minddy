import { cn } from "mangue-ui/lib/utils";

/** A static brand asset and its optional dark-background variant. */
export interface BrandMark {
  /** Logo for light theme (public/). */
  logo: string;
  /** Dark theme variant, for monochrome brands. */
  logoDark?: string;
}

/** Logo of a third party brand, with light/dark toggle when a variant exists.
 Deliberately WITHOUT "use client": used both in server
 components and client components without introducing a client boundary.

 `loading="lazy"`, and this is not a comfort detail (MIN-100). React 19
 PRELOAD from the header any `<img>` encountered in server rendering which is
 not lazy. Static marks are never more important than the page's LCP asset. */
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
