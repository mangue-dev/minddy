"use client";

import type { ComponentType, SVGProps } from "react";
import {
  ArrowRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Github, Gitlab } from "@/components/git/provider-icons";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import {
  ACTIVE_PROVIDERS,
  type RepoProviderIconName,
  type RepoProviderId,
} from "@/lib/repo-providers";

/**
 * Depot connection surface (MIN-47), AutoKap scope: an action
 * “Connect {provider}” by provider ACTIF. Read the catalog since
 * `@/lib/repo-providers` — a new provider appears automatically.
 */
const ICONS: Record<RepoProviderIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  github: Github,
  gitlab: Gitlab,
};

interface ProviderConnectButtonsProps {
  onConnect: (provider: RepoProviderId) => void;
  /** The provider currently connecting (spinner + locks the others). */
  connecting?: RepoProviderId | null;
  /** Restricted to these providers (those configured on the server side). */
  only?: RepoProviderId[];
  /**
   * Side by side, each at HIS width, instead of a full width stack. There
   * stack is the correct shape in a wizard column, where the button is the
   * only thing to aim for; under an empty state of settings, two full bars
   * width weigh more than the section that contains them.
   */
  inline?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ProviderConnectButtons({
  onConnect,
  connecting,
  only,
  inline,
  disabled,
  className,
}: ProviderConnectButtonsProps) {
  const t = useTranslations("Settings");
  const providers = only
    ? ACTIVE_PROVIDERS.filter((p) => (only as string[]).includes(p.id))
    : ACTIVE_PROVIDERS;

  return (
    <div
      className={cn(
        inline ? "flex flex-wrap justify-center gap-2" : "space-y-2",
        className
      )}
    >
      {providers.map((provider) => {
        const Icon = ICONS[provider.iconName];
        const isConnecting = connecting === provider.id;
        return (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className={cn(
              "h-auto justify-start gap-2.5 px-3 py-2.5 text-sm font-normal",
              inline ? "w-auto" : "w-full"
            )}
            disabled={disabled || connecting != null}
            onClick={() => onConnect(provider.id)}
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "truncate text-left font-medium",
                !inline && "flex-1"
              )}
            >
              {t("gitConnectWith", { provider: provider.displayName })}
            </span>
            {/* The arrow is only used for the stack: it pulls the eye towards the edge
 right of a button which occupies the entire width. A button at just its
 width has no far edge. */}
            {!isConnecting && !inline && (
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The SAME gesture, folded into a single “Connect” button. Two forge buttons
 * side by side fit in a wizard column; at the end of a card title
 * adjustments, they weigh more than the section. The menu says once you
 * connects, and only unfolds the brands when choosing.
 *
 * A single forge deployed → no menu: a button that only opens one choice
 * charges a click for nothing.
 */
export function ProviderConnectMenu({
  onConnect,
  connecting,
  only,
  disabled,
  align = "end",
}: Omit<ProviderConnectButtonsProps, "inline" | "className"> & {
  align?: "start" | "end";
}) {
  const t = useTranslations("Settings");
  const providers = only
    ? ACTIVE_PROVIDERS.filter((p) => (only as string[]).includes(p.id))
    : ACTIVE_PROVIDERS;

  if (providers.length === 0) return null;

  if (providers.length === 1) {
    const provider = providers[0];
    const Icon = ICONS[provider.iconName];
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || connecting != null}
        onClick={() => onConnect(provider.id)}
      >
        {connecting === provider.id ? <Loader2 className="animate-spin" /> : <Icon />}
        {t("gitConnectWith", { provider: provider.displayName })}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="group"
          disabled={disabled || connecting != null}
        >
          {connecting && <Loader2 className="animate-spin" />}
          {t("gitConnect")}
          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {providers.map((provider) => {
          const Icon = ICONS[provider.iconName];
          return (
            <DropdownMenuItem
              key={provider.id}
              onSelect={() => onConnect(provider.id)}
            >
              <Icon />
              {t("gitConnectWith", { provider: provider.displayName })}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
