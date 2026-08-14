"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, CardContent, Spinner } from "mangue-ui";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { consumeDesktopAuthTurn } from "@/lib/desktop/auth-turn";
import type { DesktopAuthLink } from "@/lib/desktop/auth-link";

/**
 * Le retour du tour d'authentification dans l'app de bureau (MIN-291).
 *
 * Monté dans la coquille des écrans d'auth, et là seulement : c'est le seul
 * endroit où l'app se trouve quand elle attend un deep link. Une session déjà
 * ouverte n'a rien à échanger — un lien magique cliqué alors qu'on est déjà
 * connecté ne fait donc rien, ce qui est le bon comportement.
 *
 * ## Ce qui décide de traiter un lien, ou non (MIN-345)
 *
 * macOS livre à l'app TOUT ce qui porte notre schéma, d'où qu'il vienne. Un
 * `minddy://auth?code=…` reçu du système est parfaitement lisible, et la
 * fenêtre l'échangeait — c'est-à-dire se connectait au compte de qui avait
 * envoyé le lien. Trois cas, désormais :
 *
 * - **Un code qui rapporte le nonce du tour** (`turn`) : c'est la réponse à une
 *   demande partie d'ici, on enchaîne sans rien demander. Le cas normal.
 * - **Un code sans nonce, ou avec le mauvais** : ignoré, en silence. Il n'y a
 *   rien de vrai à dire à quelqu'un qui n'a rien fait, et l'échange échouerait
 *   de toute façon — le vérificateur PKCE de ce stockage ne va pas avec ce code.
 * - **Un jeton de lien e-mail** : il ne portera JAMAIS de nonce (le gabarit
 *   GoTrue compose l'URL, et le mail s'ouvre souvent sur un autre appareil).
 *   Celui-là se confirme à la main, ici, avant qu'aucune session ne naisse.
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
  const t = useTranslations("Auth");
  const { completeDesktopSignIn } = useAuth();
  const [exchanging, setExchanging] = useState(false);
  /** Le lien e-mail en attente d'un geste. */
  const [pending, setPending] = useState<DesktopAuthLink | null>(null);

  const exchange = useCallback(
    (link: DesktopAuthLink) => {
      setPending(null);
      setExchanging(true);
      void (async () => {
        try {
          const next = await completeDesktopSignIn(link);
          window.location.replace(next);
        } catch (err) {
          console.error("[desktop] connexion par deep link échouée:", err);
          const code = link.kind === "error" ? link.error : "auth_callback_failed";
          const reason = link.kind === "error" ? link.reason : "exchange_failed";
          window.location.replace(
            `/login?error=${encodeURIComponent(code)}&reason=${encodeURIComponent(reason)}`
          );
        }
      })();
    },
    [completeDesktopSignIn]
  );

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    return bridge.onAuthLink((link) => {
      if (link.kind === "otp") {
        setPending(link);
        return;
      }
      if (link.kind === "code" && !consumeDesktopAuthTurn(link.turn)) {
        console.warn("[desktop] deep link ignoré : aucun tour d'authentification en cours");
        return;
      }
      exchange(link);
    });
  }, [exchange]);

  if (exchanging) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <ShieldCheck
            className="size-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {t("confirmSignInTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("confirmSignInBody")}</p>
          </div>
          <Button
            className="h-10 w-full justify-center"
            onClick={() => exchange(pending)}
          >
            {t("confirmSignInCta")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
