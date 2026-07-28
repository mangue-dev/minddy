"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from "mangue-ui";
import { Copy, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * « Rejoindre un projet », depuis l'étape 1 de l'onboarding.
 *
 * On ne rejoint pas un projet de son propre chef dans minddy : c'est son
 * propriétaire qui invite, par adresse e-mail. Le dialog dit donc deux choses,
 * dans cet ordre : l'adresse à transmettre — la seule chose à FAIRE ici, d'où
 * l'encart en tête et les deux boutons — puis la marche à suivre côté hôte,
 * pour qu'on puisse la lui dicter.
 */
export function OnboardingJoinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const { user } = useAuth();
  const email = user?.email ?? "";

  // `navigator.share` n'existe pas sur la plupart des navigateurs de bureau :
  // le bouton n'apparaît que là où une feuille de partage s'ouvrira vraiment.
  // Résolu après montage — le serveur n'a pas de `navigator`, et un rendu qui
  // en dépendrait ne pourrait pas s'hydrater.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(email);
    toast.success(tc("copied"));
  };

  const share = async () => {
    try {
      await navigator.share({ title: t("joinShareTitle"), text: email });
    } catch {
      // Partage annulé depuis la feuille native : ce n'est pas une erreur.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("joinTitle")}</DialogTitle>
          <DialogDescription>{t("joinDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("joinEmailLabel")}
            </p>
            <p className="truncate font-mono text-sm text-foreground" title={email}>
              {email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void copy()} disabled={!email}>
              <Copy />
              {tc("copy")}
            </Button>
            {canShare && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void share()}
                disabled={!email}
              >
                <Share2 />
                {t("joinShareCta")}
              </Button>
            )}
          </div>
        </div>

        <ol className="ml-4 flex list-decimal flex-col gap-1.5 text-sm text-muted-foreground marker:text-muted-foreground/70">
          <li>{t("joinStep1")}</li>
          <li>{t("joinStep2")}</li>
          <li>{t("joinStep3")}</li>
        </ol>

        <p className="text-xs text-muted-foreground">{t("joinOutro")}</p>
      </DialogContent>
    </Dialog>
  );
}
