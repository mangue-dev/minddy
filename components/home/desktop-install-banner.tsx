"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "mangue-ui";
import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useAuth } from "@/lib/auth-context";
import { useAnalytics } from "@/lib/use-analytics";
import { isDesktop } from "@/lib/desktop/bridge";
import {
  DESKTOP_PROMPT_DISMISSED_META_KEY,
  isMacPlatform,
  resolveDesktopPromptDismissed,
  shouldOfferDesktopApp,
} from "@/lib/desktop/install-prompt";

/**
 * « minddy existe en app Mac » — sur l'accueil WEB, une seule fois dans la vie
 * du compte (MIN-292).
 *
 * **Écarter, c'est écarter pour toujours.** Le refus est écrit dans le
 * `user_metadata` du compte et non dans le navigateur : sinon il reviendrait au
 * premier nettoyage de cache et sur la deuxième machine, et « non merci »
 * deviendrait « redemande-moi demain ». La règle complète — et le piège de
 * l'iPad qui se fait passer pour un Mac — vit dans
 * [lib/desktop/install-prompt.ts](../../lib/desktop/install-prompt.ts).
 *
 * **Tout est lu APRÈS le montage.** Ni `navigator` ni `window.minddy`
 * n'existent au rendu serveur ; les supposer ferait diverger l'hydratation. La
 * bannière n'apparaît donc jamais au premier paint, ce qui tombe bien : une
 * proposition qui surgit sous les doigts de quelqu'un est une proposition qu'on
 * clique par accident.
 */
export function DesktopInstallBanner() {
  const t = useTranslations("Home");
  const { user, updateUserMetadata } = useAuth();
  const { track } = useAnalytics();
  const [eligible, setEligible] = useState(false);
  // Écarté sur-le-champ, sans attendre GoTrue : le geste doit être instantané.
  const [dismissed, setDismissed] = useState(false);
  // L'effet re-tourne quand GoTrue rend enfin le compte : sans ce verrou, la
  // même bannière compterait deux « vue » pour un seul affichage, et le taux de
  // conversion qu'on en tire serait faux de moitié.
  const shownTracked = useRef(false);

  const alreadyDismissed = resolveDesktopPromptDismissed(user?.user_metadata);

  useEffect(() => {
    const offer = shouldOfferDesktopApp({
      inDesktopApp: isDesktop(),
      isMac: isMacPlatform({
        uaDataPlatform: (
          navigator as Navigator & { userAgentData?: { platform?: string } }
        ).userAgentData?.platform,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
      dismissed: alreadyDismissed,
    });
    setEligible(offer);
    if (offer && !shownTracked.current) {
      shownTracked.current = true;
      track("desktop_install_prompt_shown");
    }
  }, [alreadyDismissed, track]);

  if (!eligible || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    track("desktop_install_prompt_dismissed");
    // En cas d'échec on ne remet pas la bannière : l'utilisateur a dit non, et
    // la lui rendre parce que GoTrue a hoqueté serait lui redemander. Elle
    // reviendra au prochain chargement, ce qui est le pire acceptable.
    void updateUserMetadata({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: true }).catch(
      () => {}
    );
  };

  return (
    // Même coquille que les autres bandeaux de l'accueil
    // (`pending-invitations-banner.tsx`) : la colonne qui les porte tient déjà
    // les écarts, donc pas de marge propre.
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      {/* La vraie icône de l'app — celle qui a servi à fabriquer le `.icns`. */}
      <Image
        src="/web-app-manifest-192x192.png"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-lg"
      />
      <p className="min-w-0 flex-1 text-sm">{t("desktopBannerText")}</p>
      <div className="flex items-center gap-1">
        <Button asChild size="sm" variant="ghost">
          <Link
            href="/download"
            onClick={() => track("desktop_install_prompt_clicked", { surface: "home_banner" })}
          >
            {t("desktopBannerCta")}
          </Link>
        </Button>
        {/* Une VRAIE infobulle, pas l'attribut `title` : celui-ci n'apparaît
            qu'après une seconde d'immobilité, ne se déclenche pas au clavier, et
            se dessine dans le style du système plutôt que dans celui de l'app.
            L'`aria-label` reste — c'est lui que lit un lecteur d'écran, et
            l'infobulle ne le remplace pas. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t("desktopBannerDismiss")}
              onClick={dismiss}
            >
              <X />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{t("desktopBannerDismiss")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
