"use client";

import {
  ArrowRight,
  ChevronDown,
  Github,
  Gitlab,
  Loader2,
  type LucideIcon,
} from "lucide-react";
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
 * Surface de connexion des dépôts (MIN-47), portée d'AutoKap : une action
 * « Connecter {provider} » par provider ACTIF. Lit le catalogue depuis
 * `@/lib/repo-providers` — un nouveau provider apparaît automatiquement.
 */
const ICONS: Record<RepoProviderIconName, LucideIcon> = {
  github: Github,
  gitlab: Gitlab,
};

interface ProviderConnectButtonsProps {
  onConnect: (provider: RepoProviderId) => void;
  /** Le provider en cours de connexion (spinner + verrouille les autres). */
  connecting?: RepoProviderId | null;
  /** Restreint à ces providers (ceux configurés côté serveur). */
  only?: RepoProviderId[];
  /**
   * Côte à côte, chacun à SA largeur, au lieu d'une pile pleine largeur. La
   * pile est la bonne forme dans une colonne de wizard, où le bouton est la
   * seule chose à viser ; sous un état vide de réglages, deux barres pleine
   * largeur pèsent plus lourd que la section qui les contient.
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
            {/* La flèche ne sert qu'à la pile : elle tire l'œil vers le bord
                droit d'un bouton qui occupe toute la largeur. Un bouton à sa
                juste largeur n'a pas de bord lointain. */}
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
 * Le MÊME geste, replié en un seul bouton « Connecter ». Deux boutons de forge
 * côte à côte tiennent dans une colonne de wizard ; en bout de titre d'une carte
 * de réglages, ils pèsent plus lourd que la section. Le menu dit une fois qu'on
 * connecte, et ne déplie les marques qu'au moment de choisir.
 *
 * Une seule forge déployée → pas de menu : un bouton qui n'ouvre qu'un choix
 * fait payer un clic pour rien.
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
