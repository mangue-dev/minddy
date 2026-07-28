import { cn } from "mangue-ui";
import { Bot, WandSparkles } from "lucide-react";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";
import { NumoIcon } from "@/components/numo-icon";

/**
 * Les portraits des acteurs QUI NE SONT PAS DES PERSONNES : Numo, un agent
 * branché sur le serveur MCP, Smart Assign. Un compte a sa marque générée
 * (components/user-avatar.tsx) ; ces trois-là ont la leur, et elle doit être la
 * même partout — la timeline d'un ticket et l'inbox racontent la même action.
 *
 * `className` dimensionne le disque (défaut `size-5`), `iconClassName` la marque
 * à l'intérieur : les deux ne suivent pas le même rapport selon la taille.
 */

const disc = (className?: string) =>
  cn(
    "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
    className
  );

/** Action déclenchée via Numo — le visage de l'assistant plutôt que celui de la
    personne dont l'action porte techniquement le nom. */
export function NumoAvatar({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden className={disc(className)}>
      <NumoIcon animated={false} className={cn("size-3.5", iconClassName)} />
    </span>
  );
}

/** Action passée par le serveur MCP — le logo de l'agent qui a agi (Claude
    Code, Cursor…) quand la clé est rattachée à un agent connu, sinon un robot
    générique. L'acteur est l'AGENT, jamais le propriétaire de la clé. */
export function McpAvatar({
  agent,
  className,
  iconClassName,
}: {
  agent: string | null | undefined;
  className?: string;
  iconClassName?: string;
}) {
  const known = isMcpAgentId(agent) ? getMcpAgent(agent) : null;
  const logo = cn("size-3", iconClassName);
  return (
    <span aria-hidden className={disc(className)}>
      {known ? (
        known.logoDark ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={known.logo} alt="" className={cn(logo, "dark:hidden")} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={known.logoDark}
              alt=""
              className={cn(logo, "hidden dark:block")}
            />
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={known.logo} alt="" className={logo} />
        )
      ) : (
        <Bot className={cn("size-3.5", iconClassName)} />
      )}
    </span>
  );
}

/** Affectation faite par Smart Assign — la fonctionnalité tient lieu d'acteur,
    jamais l'utilisateur qui a sorti le ticket du triage. */
export function SmartAssignAvatar({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden className={disc(className)}>
      <WandSparkles className={cn("size-3", iconClassName)} />
    </span>
  );
}
