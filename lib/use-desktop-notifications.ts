"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { getDesktopBridge } from "./desktop/bridge";
import { notificationActor, notificationTitle } from "./notification-line";
import { NOTIFICATION_LINE_KEYS, notificationTargetPath } from "./notification-target";
import { useNotifications } from "./use-notifications";
import type { MyNotification } from "./types";

/**
 * Les notifications natives de l'app de bureau (MIN-291) — **zéro
 * infrastructure neuve**.
 *
 * Le pont temps réel de MIN-89 est déjà abonné à TOUS les projets de
 * l'utilisateur et rafraîchit `["notifications"]` à chaque écriture : la liste
 * qu'on lit ici arrive donc d'elle-même, sans table, sans clé, sans émetteur.
 * Il n'y a plus qu'à en faire des bannières. Le renderer les émet et Electron
 * les rend natives ; c'est le même `new Notification()` que le web, vérifié
 * dans une vraie fenêtre par la sonde de MIN-290 (permission déjà `granted`).
 *
 * **Ce qu'on ne fait pas, et qui est assumé** : app quittée, plus rien. Pas
 * d'APNS, pas de FCM. Qui veut être prévenu à coup sûr garde le web, qui a le
 * vrai push depuis MIN-183 (§3 de docs/desktop-electron.md).
 *
 * ## L'amorçage silencieux
 *
 * Au premier passage, on ENREGISTRE la liste sans rien afficher. Sans ça,
 * ouvrir l'app le matin ferait tomber trente bannières d'un coup — des choses
 * qui se sont passées hier, dont aucune n'est un événement du moment. La
 * première liste n'est pas une nouvelle : c'est un état.
 */
export function useDesktopNotifications(): void {
  const { notifications, unreadCount } = useNotifications();
  const router = useRouter();
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const tTimeline = useTranslations("Timeline");

  /** `null` tant que la première liste n'est pas arrivée (cf. amorçage). */
  const seen = useRef<Set<string> | null>(null);
  /** Les bannières encore à l'écran, pour les refermer quand la ligne est lue. */
  const shown = useRef(new Map<string, Notification>());

  // Le compteur du dock : le chiffre exact des non-lues, celui-là même que
  // porte la barre latérale. `0` retire la pastille.
  useEffect(() => {
    getDesktopBridge()?.setBadgeCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // MIN-356 : les coquilles récentes reçoivent la même ligne par APNs, même
    // quand elles sont quittées. Garder aussi le relais realtime afficherait
    // chaque événement deux fois. Les anciennes coquilles conservent ce repli.
    if (bridge.registerForPushNotifications) return;
    if (typeof Notification === "undefined") return;

    if (seen.current === null) {
      seen.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const fresh: MyNotification[] = [];
    for (const n of notifications) {
      if (seen.current.has(n.id)) continue;
      if (!n.read_at) fresh.push(n);
    }

    // La liste arrive du plus récent au plus ancien ; les bannières s'empilent
    // dans l'ordre d'émission. On part donc de la plus ancienne pour que la
    // plus récente finisse SUR LE DESSUS de la pile.
    if (Notification.permission === "granted") {
      const labels = {
        someone: t("someone"),
        mcpFallback: tTimeline("mcpFallback"),
        somePageFallback: t("somePageFallback"),
        someAgentConversationFallback: t("someAgentConversationFallback"),
        someIssueFallback: t("someIssueFallback", {
          entity: tIssue("entity").toLowerCase(),
        }),
      };
      for (const n of fresh.reverse()) {
        const path = notificationTargetPath(n);
        const sentence = t(NOTIFICATION_LINE_KEYS[n.type], {
          actor: notificationActor(n, labels),
        });
        const native = new Notification(notificationTitle(n, labels), {
          body: n.comment_excerpt
            ? `${sentence} : ${n.comment_excerpt}`
            : sentence,
          // Le `tag` est le chemin de destination, comme côté web (public/sw.js) :
          // deux notifications sur la même cible se REMPLACENT au lieu d'empiler.
          ...(path ? { tag: path } : {}),
        });
        native.onclick = () => {
          // La fenêtre d'abord : le clic est livré au renderer, qui est derrière
          // ce que l'utilisateur regardait. Naviguer sans réveiller ne montre rien.
          bridge.focus();
          if (path) router.push(path);
          native.close();
          shown.current.delete(n.id);
        };
        shown.current.set(n.id, native);
      }
    }

    // Lue ailleurs (un autre appareil, la page d'inbox, un clic) : la bannière
    // n'a plus rien à annoncer. Une notification système ne s'efface pas toute
    // seule — c'est le même constat que lib/push/dismiss.ts côté web.
    const byId = new Map(notifications.map((n) => [n.id, n]));
    for (const [id, native] of shown.current) {
      const row = byId.get(id);
      if (row && !row.read_at) continue;
      native.close();
      shown.current.delete(id);
    }

    // Le registre suit la liste plutôt que de grossir indéfiniment : une ligne
    // supprimée en sort, et elle n'y reviendra pas.
    seen.current = new Set(byId.keys());
  }, [notifications, router, t, tIssue, tTimeline]);
}
