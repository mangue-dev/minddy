"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { closeNotificationsForView } from "@/lib/push/dismiss";

/**
 * Referme les notifications poussées de l'écran qu'on est en train de regarder.
 * Aucun rendu : ce composant n'existe que pour son effet, à côté de
 * `<PushServiceWorker />` dans les providers de l'app.
 *
 * ## Les trois moments où il faut regarder
 *
 * Ils ne se recouvrent pas, et il en manquerait un dans n'importe quelle paire :
 *
 *   • **la navigation** — le cas courant : la notification est arrivée pendant
 *     qu'on faisait autre chose, et on ouvre le ticket depuis l'app ;
 *   • **le retour sur l'onglet** (`visibilitychange`) — la notification est
 *     arrivée alors que la page concernée était déjà ouverte, mais en arrière-plan.
 *     Rien ne bouge côté route quand on revient dessus ;
 *   • **l'affichage d'un push** (`push-shown`, posté par public/sw.js) — on est
 *     PILE sur la page, au premier plan, quand la bannière tombe. Ni route ni
 *     visibilité ne changent : sans ce message, celle-là resterait pour toujours.
 *
 * D'où la condition commune : on ne referme que si l'onglet est **visible**. Une
 * notification qu'on n'a pas eu l'occasion de voir doit rester — un onglet
 * oublié en arrière-plan sur le bon ticket avalerait tout, en silence.
 *
 * ## `useSearchParams`, et donc `<Suspense>`
 *
 * La cible d'une notification vit dans la query (`?issue=…`), pas dans le
 * chemin : ouvrir un ticket depuis son board ne change QUE ça. `usePathname`
 * seul ne se réveillerait jamais. C'est ce qui oblige à monter le composant sous
 * une frontière `<Suspense>`, côté app-providers.
 */
export function PushNotificationDismiss() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;

    const sweep = () => {
      if (document.visibilityState !== "visible") return;
      void closeNotificationsForView(url);
    };

    sweep();

    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "push-shown") sweep();
    };

    document.addEventListener("visibilitychange", sweep);
    // Optionnel jusqu'au bout : `navigator.serviceWorker` n'existe pas en
    // contexte non sécurisé ni en navigation privée Firefox.
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      document.removeEventListener("visibilitychange", sweep);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [pathname, search]);

  return null;
}
