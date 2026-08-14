import { Bot, Check } from "lucide-react";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";

/**
 * Paire de logos des pages OAuth : minddy ⟷ l'application, côte à côte, SANS
 * containers (les marques respirent). Entre les deux : trois points en
 * connexion, remplacés par une coche sur l'état "success".
 *
 * En face de minddy, une silhouette générique et rien d'autre. Le composant
 * rendait le vrai logo du vendeur deviné à partir du `client_name` — un champ
 * libre, posé par le client lui-même à l'inscription, qui est ouverte à tous.
 * Afficher la marque d'Anthropic parce qu'une application s'est appelée
 * « Claude », c'est signer d'une identité que personne n'a vérifiée, sur
 * l'écran précis où l'utilisateur décide à qui il donne son compte (MIN-346).
 */
export function OAuthLogoPair({
  state = "connect",
  className,
}: {
  state?: "connect" | "success";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-5", className)}>
      <MinddyLogo className="h-11 w-11 shrink-0 text-foreground" />

      {state === "success" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-1 rounded-full bg-muted-foreground/40" />
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          <span className="size-1 rounded-full bg-muted-foreground/40" />
        </span>
      )}

      <Bot className="size-11 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}
