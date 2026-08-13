"use client";

import { useEffect } from "react";

import { isDesktop } from "@/lib/desktop/bridge";

/**
 * L'app de bureau n'affiche jamais le site public (MIN-291).
 *
 * L'argumentaire s'adresse à quelqu'un qui ne s'est pas encore décidé ; dans
 * l'app installée, cette personne-là n'existe pas. Elle a déjà téléchargé,
 * signé le premier lancement, et ce qu'elle veut voir en ouvrant la fenêtre,
 * c'est son travail — ou l'écran qui l'y mène.
 *
 * **La destination est `/home`, pas `/login`**, et c'est ce qui fait que la
 * règle n'a qu'un cas : le proxy y renvoie vers `/login` quand la session
 * manque, et rend l'app quand elle est là. Viser `/login` directement
 * ferait clignoter l'écran de connexion sous les yeux de quelqu'un qui est
 * déjà connecté.
 *
 * Monté dans le layout du groupe `(marketing)`, il couvre landing, tarifs,
 * changelog et le reste d'un coup — y compris quand on y arrive par une
 * navigation cliente, que le main process ne voit pas passer. Le cas courant,
 * lui, ne l'atteint jamais : la fenêtre charge `/home` d'entrée
 * (desktop/src/main.ts).
 */
export function DesktopMarketingRedirect() {
  useEffect(() => {
    if (!isDesktop()) return;
    window.location.replace("/home");
  }, []);

  return null;
}
