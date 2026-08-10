import { cn } from "mangue-ui";
import { Bot, Sparkles, WandSparkles, Workflow } from "lucide-react";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";
import { NumoFace } from "@/components/numo-face";

/**
 * Les portraits des acteurs QUI NE SONT PAS DES PERSONNES : Numo, un agent
 * branché sur le serveur MCP, Smart Assign, une automatisation de projet. Un
 * compte a sa marque générée (components/user-avatar.tsx) ; ceux-là ont la
 * leur, et elle doit être la même partout — la timeline d'un ticket et l'inbox
 * racontent la même action.
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
    personne dont l'action porte techniquement le nom.

    Le dessin vient de `NumoFace`, pas de `NumoIcon` : ce portrait-là ne cligne
    jamais, et `NumoIcon` appelle `useAnimate()` au premier niveau — il ferait
    donc entrer framer-motion dans le bundle de tout écran qui montre un acteur
    (une pilule de mention dans un commentaire, par exemple) pour un visage
    immobile. Même raison qu'en MIN-100, voir components/numo-face.tsx. */
export function NumoAvatar({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden className={disc(className)}>
      <NumoFace className={cn("size-3.5", iconClassName)} />
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

/** Geste joué par une AUTOMATISATION de projet (MIN-147) — la règle tient lieu
    d'acteur, jamais l'assigné dont le compte porte techniquement le lancement.
    Le même glyphe que partout ailleurs dans la feature (barre de chaîne, entrée
    « Automatiser » du menu, picker de préréglage) : une boucle se reconnaît au
    même dessin sur toutes ses surfaces. */
export function AutomationAvatar({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden className={disc(className)}>
      <Workflow className={cn("size-3", iconClassName)} />
    </span>
  );
}

/** Ticket rempli par Smart-fill (MIN-260) — la fonctionnalité tient lieu
    d'acteur, jamais la personne qui a écrit le ticket : elle n'a pas posé ces
    propriétés-là. `Sparkles` et non `WandSparkles` : Smart Assign est juste
    en dessous avec la baguette, et les deux se croisent dans la même timeline —
    deux automatisations voisines doivent rester distinguables d'un coup d'œil. */
export function SmartFillAvatar({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden className={disc(className)}>
      <Sparkles className={cn("size-3", iconClassName)} />
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
