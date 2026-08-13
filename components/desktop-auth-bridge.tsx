"use client";

import { useEffect, useState } from "react";
import { Spinner } from "mangue-ui";

import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge } from "@/lib/desktop/bridge";

/**
 * Le retour du tour d'authentification dans l'app de bureau (MIN-291).
 *
 * Monté dans la coquille des écrans d'auth, et là seulement : c'est le seul
 * endroit où l'app se trouve quand elle attend un deep link. Une session déjà
 * ouverte n'a rien à échanger — un lien magique cliqué alors qu'on est déjà
 * connecté ne fait donc rien, ce qui est le bon comportement.
 *
 * ## Pourquoi un rechargement complet plutôt qu'une navigation cliente
 *
 * Le lien peut arriver AVANT que React ne soit monté (macOS lance l'app avec son
 * `open-url` en poche ; le pont le rejoue à l'abonnement). Un rechargement remet
 * l'app entière — composants serveur compris, et le proxy avec eux — sur la
 * session qui vient de naître, sans qu'on ait à raisonner sur ce qui avait déjà
 * été rendu avec l'ancienne. C'est une connexion : un chargement de plus n'y
 * coûte rien, et ça retire toute une classe d'états intermédiaires.
 *
 * L'échec repart vers `/login?error=…` avec les codes déjà en place : les mêmes
 * phrases que le web pour les mêmes refus, aucune traduction de plus.
 */
export function DesktopAuthBridge() {
  const { completeDesktopSignIn } = useAuth();
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    return bridge.onAuthLink((link) => {
      setExchanging(true);
      void (async () => {
        try {
          const next = await completeDesktopSignIn(link);
          window.location.replace(next);
        } catch (err) {
          console.error("[desktop] connexion par deep link échouée:", err);
          const code =
            link.kind === "error" ? link.error : "auth_callback_failed";
          const reason = link.kind === "error" ? link.reason : "exchange_failed";
          window.location.replace(
            `/login?error=${encodeURIComponent(code)}&reason=${encodeURIComponent(reason)}`
          );
        }
      })();
    });
  }, [completeDesktopSignIn]);

  if (!exchanging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <Spinner className="size-6" />
    </div>
  );
}
