"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "mangue-ui";
import { BarChart3 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { isDesktop } from "@/lib/desktop/bridge";
import {
  ANALYTICS_CONSENT_META_KEY,
  readConsent,
  resolveAnalyticsConsent,
  writeConsent,
  type CookieConsent,
} from "@/lib/cookie-consent";
import { useAnalytics } from "@/lib/use-analytics";

/**
 * La question de la mesure d'audience, posée UNE FOIS, dans l'app de bureau
 * (MIN-291).
 *
 * Le bandeau de bas de page ne suit pas dans la fenêtre : c'est un objet de site
 * (voir components/cookie-banner.tsx). Mais la seule autre porte étant les
 * réglages, personne n'y serait jamais allé de lui-même, et la mesure serait
 * restée éteinte pour tout le monde sans que ce soit un choix. On pose donc la
 * question, à la façon d'une app : au centre, une fois, avec deux réponses
 * franches — et on n'y revient plus.
 *
 * ## Trois décisions qui tiennent ensemble
 *
 * **Dans l'app, pas sur l'écran de connexion.** Ce composant vit sous le shell
 * authentifié : demander avant que la personne soit entrée, c'est demander à
 * quelqu'un qui n'est pas encore là.
 *
 * **Aucune sortie sans réponse** — ni croix, ni Échap, ni clic à côté. Ce n'est
 * pas pour forcer la main : les deux réponses sont côte à côte et de même poids.
 * C'est pour que la question ne se repose pas au lancement suivant, ce qui la
 * transformerait en harcèlement — le défaut même des bandeaux qu'on remplace.
 *
 * **Et elle reste réversible**, dans les réglages, ce que le dialogue dit
 * lui-même plutôt que de le laisser deviner.
 *
 * ## « Une fois » veut dire une fois, et le stockage local ne suffisait pas
 *
 * Le choix vivait dans le seul localStorage. Dans un navigateur, ça tient — il
 * garde son stockage pour toujours. Ici, non : la question revenait à chaque
 * lancement, et à chaque reconnexion. Un profil neuf, une réinstallation, une
 * coquille de dév, et la modale bloquante repartait de zéro. C'est exactement le
 * harcèlement que le troisième point ci-dessus prétendait éviter.
 *
 * Le choix est donc AUSSI écrit dans le compte (`user_metadata`), et cet
 * écran-ci l'y lit d'abord : un appareil sans choix local mais dont le compte en
 * porte un l'ADOPTE en silence, sans redemander. Voir lib/cookie-consent.ts pour
 * le partage des rôles entre les deux stockages.
 */
export function DesktopAnalyticsPrompt() {
  const t = useTranslations("Analytics");
  const { track } = useAnalytics();
  const { user, updateUserMetadata } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Après le montage : ni le pont ni le stockage local n'existent au rendu
    // serveur, et les supposer ferait diverger l'hydratation.
    if (!isDesktop() || readConsent() !== null) return;
    // La session arrive après le premier rendu : tant qu'elle n'est pas là, on
    // ne sait pas encore si la question a déjà une réponse, et la poser serait
    // la poser à quelqu'un qui y a peut-être déjà répondu.
    if (!user) return;
    const fromAccount = resolveAnalyticsConsent(user.user_metadata);
    // Adopté sur cet appareil : `writeConsent` prévient PostHog dans la foulée,
    // donc la mesure part (ou reste coupée) sans rechargement ni question.
    if (fromAccount) writeConsent(fromAccount);
    else setOpen(true);
  }, [user]);

  const choose = (consent: CookieConsent) => {
    // Tracké AVANT `writeConsent`, comme le bandeau : sur un refus, celui-ci
    // coupe la capture et l'événement ne partirait plus. Il part donc dans le
    // mode pré-choix — anonyme, sans rien écrire sur l'appareil.
    track("cookie_consent_choice", { choice: consent });
    writeConsent(consent);
    setOpen(false);
    // Le compte, pour que la question ne se repose pas sur le prochain profil.
    // Détaché volontairement : l'écran est déjà fermé, et une panne de réseau ne
    // doit pas rouvrir une modale bloquante sur un choix déjà fait ici.
    void updateUserMetadata({ [ANALYTICS_CONSENT_META_KEY]: consent }).catch(
      (e: unknown) => console.error("[analytics] consentement non enregistré:", e)
    );
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-[calc(100%-2rem)] sm:max-w-[420px]"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BarChart3 className="size-4" />
        </div>
        <DialogTitle className="mt-3 text-base">{t("promptTitle")}</DialogTitle>
        <DialogDescription className="leading-relaxed">
          {t("description")} {t("promptSettingsHint")}
        </DialogDescription>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => choose("declined")}>
            {t("promptDecline")}
          </Button>
          <Button onClick={() => choose("accepted")}>{t("promptAccept")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
