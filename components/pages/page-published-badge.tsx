"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, Tooltip, TooltipContent, TooltipTrigger, toast } from "mangue-ui";
import { Globe, Link2, Lock } from "lucide-react";

import { fetchPageShareApi } from "@/lib/pages-api";
import { pageShareKey } from "@/components/pages/page-publish-dialog";

/**
 * « Cette page est publique » — dans la page, pas dans un réglage (MIN-283).
 *
 * C'est la moitié de la feature qu'on oublie : publier est un geste qu'on fait
 * une fois et qu'on oublie, et une page publiée qu'on continue d'éditer publie
 * chaque phrase qu'on y écrit. L'indicateur est donc DANS l'en-tête du
 * document, à côté de l'état d'enregistrement — là où l'œil passe déjà.
 *
 * Discret quand tout va bien, jamais absent : une pastille, le cadenas quand un
 * mot de passe la protège, et le lien d'un clic. Ce qui l'ouvre est le dialogue
 * de publication, où « Cesser de publier » attend.
 */
export function PagePublishedBadge({
  projectId,
  pageId,
  onOpenPublish,
}: {
  projectId: string;
  pageId: string;
  onOpenPublish: () => void;
}) {
  const t = useTranslations("PublishPage");
  // Même clé de cache que le dialogue : publier ou dépublier depuis lui fait
  // apparaître ou disparaître cette pastille sans un aller-retour de plus.
  const { data: share } = useQuery({
    queryKey: pageShareKey(pageId),
    queryFn: () => fetchPageShareApi(projectId, pageId),
    // Une page ouverte est lue bien plus souvent qu'elle n'est publiée : la
    // fenêtre de fraîcheur ordinaire suffit largement.
    staleTime: 60_000,
  });
  if (!share) return null;

  const url = `${window.location.origin}/p/${share.token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  };

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-brand hover:text-brand"
            onClick={onOpenPublish}
          >
            {share.level === "password" ? (
              <Lock className="size-3.5" />
            ) : (
              <Globe className="size-3.5" />
            )}
            {t("published")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("publishedTooltip")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t("copyLink")}
            onClick={() => void copy()}
          >
            <Link2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("copyLink")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
