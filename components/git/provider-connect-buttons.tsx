"use client";

import { ArrowRight, Github, Gitlab, Loader2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
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
