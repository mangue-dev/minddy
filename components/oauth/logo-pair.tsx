import { Bot, Check } from "lucide-react";
import { cn } from "mangue-ui";
import { MinddyLogo } from "@/components/minddy-logo";

/**
 * Pair of OAuth page logos: minddy ⟷ the application, side by side, WITHOUT
 * containers (the brands breathe). Between the two: three dots in
 * connection, replaced by a check mark on the "success" state.
 *
 * In front of minddy, a generic silhouette and nothing else. The component
 * made the real logo of the seller guessed from the `client_name` — a free field
 *, set by the customer himself during registration, which is open to all.
 * Display the Anthropic brand because an application was called
 * "Claude" is signing of an identity that no one has verified, on
 * the precise screen where the user decides to whom he gives his account (MIN-346).
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
