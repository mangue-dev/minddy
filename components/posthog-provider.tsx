"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useState, type ReactNode } from "react";
import { isLocalAnalyticsHostname } from "@/lib/analytics-localhost";
import { markAnalyticsReady } from "@/lib/analytics";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/lib/cookie-consent";

/**
 * Initialisation de PostHog (MIN-78).
 *
 * DIFFÉRÉE. Le script d'init et l'aller-retour vers eu.i.posthog.com pèsent sur
 * le LCP ; on attend que le navigateur soit inactif (`requestIdleCallback`, avec
 * un `setTimeout` de repli pour Safari ancien). Conséquence assumée : les tout
 * premiers instants d'une visite ne sont pas instrumentés — les actions qu'on
 * mesure arrivent bien après.
 *
 * CONSENTEMENT (contrat posé par `lib/cookie-consent.ts`, MIN-77) — trois états :
 *
 *   1. PAS ENCORE DE CHOIX → capture ANONYME et SANS COOKIE
 *      (`persistence: "memory"`). RIEN n'est écrit sur l'appareil : ni cookie,
 *      ni localStorage. L'article 82 de la loi Informatique et Libertés vise la
 *      lecture/écriture sur le terminal, pas la mesure elle-même — sans stockage,
 *      le consentement préalable n'est pas déclenché. L'identité meurt avec
 *      l'onglet : aucun recoupement d'une visite à l'autre. Base légale :
 *      intérêt légitime, mesure d'audience non identifiante.
 *
 *      POURQUOI. Sans ça on est aveugle sur la majorité des visiteurs de la
 *      landing — ceux qui ne cliquent jamais le bandeau — c'est-à-dire
 *      exactement le haut de l'entonnoir d'acquisition, là où se joue la
 *      question « d'où viennent les inscriptions ? ».
 *
 *   2. « ACCEPTER » → bascule à chaud vers `localStorage+cookie` : l'identité
 *      survit au rechargement, les parcours multi-sessions deviennent lisibles.
 *
 *   3. « REFUSER » → `opt_out_capturing()` : plus rien ne part, du tout.
 *
 * Le bandeau émet `CONSENT_CHANGED_EVENT` : on réagit sans rechargement.
 * Les pages Confidentialité et Cookies décrivent ces trois états — les garder
 * synchronisées avec ce fichier fait partie du contrat.
 *
 * MINIMISATION. `autocapture: false` et `disable_session_recording: true` : on
 * n'envoie QUE les événements du catalogue, aux props sanitisées. Aucune capture
 * DOM automatique, aucun enregistrement d'écran — les tickets et commentaires
 * des utilisateurs ne doivent jamais transiter par un outil d'analytics.
 */

const IDLE_TIMEOUT_MS = 800;
const FALLBACK_DELAY_MS = 600;

type IdleWindow = typeof window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function PostHogProvider({ children }: { children: ReactNode }) {
  // `posthog-js` est un singleton : le provider React ne sert qu'à exposer le
  // client aux hooks. On ne rend les enfants sous le provider qu'une fois monté
  // pour éviter que `usePostHog()` ne renvoie un client non initialisé au SSR.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Analytics désactivées (pas de clé, ou trafic local) : on « débloque »
    // quand même la file d'attente, sinon chaque identify/group en attente s'y
    // accumulerait sans jamais être vidé. Les callbacks libérés tapent sur un
    // client non initialisé, donc ne font rien — c'est l'effet recherché.
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      markAnalyticsReady();
      return;
    }

    // Le trafic local est ignoré par défaut pour ne pas polluer les stats.
    // `NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1` (avec une clé jetable) permet de
    // vérifier le câblage en dev. À laisser désactivé partout ailleurs.
    const allowLocalhost = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST === "1";
    if (!allowLocalhost && isLocalAnalyticsHostname(window.location.hostname)) {
      markAnalyticsReady();
      return;
    }

    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
    let initialized = false;

    const applyConsent = () => {
      const consent = readConsent();
      if (consent === "declined") {
        posthog.opt_out_capturing();
        return;
      }
      // Un refus peut être révoqué depuis la page Cookies : on remet la capture.
      if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
      if (consent === "accepted") {
        // Mémoire → stockage persistant : l'identité survit désormais au
        // rechargement. `set_config` est la seule voie supportée après l'init.
        posthog.set_config({ persistence: "localStorage+cookie" });
      }
    };

    const initPostHog = () => {
      const consent = readConsent();
      posthog.init(key, {
        api_host: host,
        // `history_change` et non `true` : minddy est une SPA App Router, la
        // navigation passe par pushState. Avec `true`, on ne compterait qu'une
        // seule page vue par session — celle du chargement initial.
        capture_pageview: "history_change",
        capture_pageleave: true,
        person_profiles: "identified_only",
        autocapture: false,
        disable_session_recording: true,
        // On capture dès la première visite, mais tant que le bandeau n'est pas
        // tranché la persistance reste EN MÉMOIRE : rien n'est écrit sur
        // l'appareil et l'identité meurt avec l'onglet (voir l'en-tête).
        opt_out_capturing_by_default: false,
        persistence: consent === "accepted" ? "localStorage+cookie" : "memory",
      });
      initialized = true;
      if (consent === "declined") posthog.opt_out_capturing();
      // Rejoue l'identité et le groupe mis en attente pendant l'init différée
      // (voir `onAnalyticsReady`) — sans ça l'utilisateur reste anonyme.
      markAnalyticsReady();
      setReady(true);
    };

    const onConsentChanged = () => {
      // Le choix peut tomber AVANT la fin de l'init différée : dans ce cas
      // `initPostHog` lira la valeur fraîche du localStorage, rien à faire.
      if (initialized) applyConsent();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);

    const win = window as IdleWindow;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleHandle = win.requestIdleCallback(initPostHog, { timeout: IDLE_TIMEOUT_MS });
    } else {
      timeoutHandle = window.setTimeout(initPostHog, FALLBACK_DELAY_MS);
    }

    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
      if (idleHandle !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, []);

  // `ready` n'est là que pour forcer un re-rendu après l'init différée, afin que
  // les consommateurs de `usePostHog()` reçoivent le client une fois prêt.
  void ready;

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
