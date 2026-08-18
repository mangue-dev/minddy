import { cn } from "mangue-ui";
import { Bot, Sparkles, WandSparkles, Workflow } from "lucide-react";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";
import { NumoFace } from "@/components/numo-face";

/**
 * Portraits of actors WHO ARE NOT PEOPLE: Numo, an agent
 * connected to the MCP server, Smart Assign, project automation. A
 * account has its generated brand (components/user-avatar.tsx); these have the
 * them, and it must be the same everywhere — the timeline of a ticket and the inbox
 * tell the same action.
 *
 * `className` sizes the disk (default `size-5`), `iconClassName` marks it
 * inside: the two do not follow the same ratio according to size.
 */

const disc = (className?: string) =>
  cn(
    "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand",
    className
  );

/** Action triggered via Numo — the assistant's face rather than that of the
 person whose action technically bears the name.

 The drawing comes from `NumoFace`, not from `NumoIcon`: this portrait never blinks
, and `NumoIcon` calls `useAnimate()` at the first level — it would
 so enter framer-motion in the bundle of any screen that shows an actor
 (a mention pill in a comment, for example) for a still face
. Same reason as in MIN-100, see components/numo-face.tsx. */
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

/** Action passed by the MCP server — the logo of the agent who acted (Claude
 Code, Cursor…) when the key is attached to a known agent, otherwise a generic robot
. The actor is the AGENT, never the owner of the key. */
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

/** Gesture played by a project AUTOMATION (MIN-147) — the rule takes place
 actor, never the assignee whose account technically carries the launch.
 The same glyph as everywhere else in the feature (chain bar, entry
 “Automate” from the menu, preset picker): a loop is recognized au
 same design on all its surfaces. */
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

/** Ticket filled by Smart-fill (MIN-260) — functionality takes place
 of actor, never the person who wrote the ticket: she did not set these
 properties. `Sparkles` and not `WandSparkles`: Smart Assign is just
 below with the wand, and the two intersect in the same timeline —
 two neighboring automations must remain distinguishable at a glance. */
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

/** Assignment made by Smart Assign — the functionality takes the place of an actor,
 never the user who took the ticket out of triage. */
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
