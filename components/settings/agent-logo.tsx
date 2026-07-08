import { cn } from "mangue-ui";
import type { McpAgent } from "@/lib/mcp-agents";

/** Logo d'un agent du registry, avec bascule light/dark quand une variante
    existe. Volontairement SANS "use client" : utilisé aussi bien dans des
    server components (pages OAuth) que dans des client components (settings) —
    et l'objet McpAgent porte une fonction build() non sérialisable à la
    frontière RSC. */
export function AgentLogo({ agent, className }: { agent: McpAgent; className?: string }) {
  if (!agent.logoDark) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={agent.logo} alt="" aria-hidden className={className} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={agent.logo} alt="" aria-hidden className={cn(className, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.logoDark}
        alt=""
        aria-hidden
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
