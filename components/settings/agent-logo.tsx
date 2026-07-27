import { cn } from "mangue-ui/lib/utils";
import type { McpAgent } from "@/lib/mcp-agents";

/** Logo d'un agent du registry, avec bascule light/dark quand une variante
    existe. Volontairement SANS "use client" : utilisé aussi bien dans des
    server components (pages OAuth) que dans des client components (settings) —
    et l'objet McpAgent porte une fonction build() non sérialisable à la
    frontière RSC.

    `loading="lazy"`, et ce n'est pas un détail de confort (MIN-100). React 19
    PRÉCHARGE depuis l'en-tête toute `<img>` rencontrée au rendu serveur qui n'est
    pas paresseuse : la vitrine des agents de la landing — neuf logos, en double
    quand il existe une variante sombre — posait donc dix-huit
    `<link rel="preload" as="image">` dans le `<head>`, tous devant la capture du
    hero, qui est l'élément LCP. Aucun de ces logos n'est au premier écran ; un
    logo dans le viewport (page OAuth, réglages) se charge de toute façon
    immédiatement, `lazy` ou pas. */
export function AgentLogo({ agent, className }: { agent: McpAgent; className?: string }) {
  if (!agent.logoDark) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={agent.logo} alt="" aria-hidden loading="lazy" className={className} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.logo}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(className, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.logoDark}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
