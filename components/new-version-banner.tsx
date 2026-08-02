"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { Button, cn, transitions } from "mangue-ui";
import { useNewVersion } from "@/lib/use-new-version";

/**
 * « Une nouvelle version est disponible » (MIN-157) : un déploiement plus récent
 * que le code chargé dans cet onglet est en ligne, on propose de recharger.
 *
 * Discret et refermable — c'est une information, pas une interruption. Fermer
 * mémorise le SHA refusé : ce déploiement-là ne le rouvrira plus, le suivant si.
 *
 * Position : `bottom-24` dégage les trois occupants du coin bas-droit — le FAB
 * de Numo (`bottom-4 md:bottom-6`), la barre de navigation mobile sous 1200 px,
 * et le bandeau cookies. Volontairement PAS masqué en mode zen : c'est un
 * événement d'application, rare et refermable, pas du chrome.
 */
export function NewVersionBanner() {
  const t = useTranslations("NewVersion");
  const { visible, dismiss, refresh, refreshing } = useNewVersion();

  return (
    // La région live est montée EN PERMANENCE, vide tant qu'il n'y a rien à
    // dire. Une région `aria-live` créée en même temps que son contenu n'est
    // pas annoncée : les lecteurs d'écran surveillent les régions qu'ils
    // connaissaient déjà. Vide, le conteneur mesure 0 × 0 et n'intercepte rien.
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // Ré-ancre le bandeau au coin du shell centré sur ultrawide
        // (≥2200px) — voir globals.css `.ultrawide-canvas`.
        "new-version-anchor",
        // `w-max` : la carte se taille sur sa phrase, qui tient alors sur une
        // ligne. Bornée à un cadre plutôt qu'un `max-w-xs` fixe — à 320 px la
        // phrase se coupait en son milieu, et sur un téléphone étroit la carte
        // débordait.
        "fixed right-4 bottom-24 z-40 md:right-6",
        "w-max max-w-[calc(100vw-2rem)]",
        "pb-[env(safe-area-inset-bottom)]",
        !visible && "pointer-events-none",
      )}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="new-version-banner"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={transitions.gentle}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg"
          >
            <p className="text-sm text-card-foreground">{t("title")}</p>
            {/*
              Deux signes de vie, sans lesquels le bouton passe pour inerte :

              — le survol. Le variant `default` de mangue-ui ne recolore QUE
                rendu en lien (`[a]:hover:bg-primary/80`, soit `:is(a):hover`
                une fois compilé) ; sur un vrai <button>, il ne se passe rien.
                On rétablit la teinte que la librairie applique elle-même à ses
                boutons pleins (`send-button-with-cost`), et le curseur main,
                que Tailwind v4 ne met plus sur `button`.
              — le clic. Le rechargement n'affiche rien pendant sa seconde de
                latence : le spinner et l'état désactivé la remplissent, et
                évitent le second clic.
            */}
            <Button
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              className="cursor-pointer enabled:hover:bg-primary/90"
            >
              {refreshing && <Loader2 className="animate-spin" />}
              {t("refresh")}
            </Button>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("dismiss")}
              className={cn(
                "-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "cursor-pointer",
              )}
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
