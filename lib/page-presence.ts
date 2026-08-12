"use client";

// QUI EST SUR QUELLE PAGE (MIN-271) — la présence, et rien d'autre.
//
// Un canal par PROJET, pas un par page. La charge utile porte `pageId`, donc un
// seul abonnement suffit à savoir qui lit quoi dans tout le wiki : l'arbre peut
// poser sa pastille sur n'importe quelle ligne sans ouvrir vingt canaux, et
// changer de page ne rejoint rien — on se contente de retrack.
//
// Ce que la présence apporte, et que la sauvegarde versionnée ne peut pas
// donner : savoir AVANT d'écrire qu'on n'est pas seul. Le 409 et la fusion par
// bloc rattrapent la collision ; l'avatar en haut de page l'évite.
//
// Le fichier est séparé du hook React, et pas par goût du découpage : c'est ce
// qui rend le CYCLE DE VIE testable (lib/page-presence.test.ts). Un abonnement
// qui ne redescend jamais de son canal est le défaut qu'on a déjà livré une
// fois (PR 48) — il compilait, il passait le type-check, et personne ne pouvait
// l'attraper autrement qu'en montant puis démontant pour de vrai.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "./supabase";

/** Le topic. Privé, autorisé par `can_access_project` — cf. la migration
    20261127090000_page_presence. */
export const pagePresenceTopic = (projectId: string) =>
  `page-presence:${projectId}`;

/** Ce qu'on diffuse de soi : le strict nécessaire pour dessiner un avatar. */
export interface PagePresenceState {
  userId: string;
  pageId: string;
}

/** Les pages regardées, par pageId → les ids des AUTRES personnes présentes. */
export type PagePresenceMap = Map<string, string[]>;

/** Le minimum qu'on demande au client Supabase — de quoi mentir dans un test
    sans reconstruire la moitié du SDK. */
type PresenceClient = Pick<SupabaseClient, "channel" | "removeChannel"> & {
  realtime: { setAuth: () => Promise<unknown> };
};

export interface PagePresenceHandle {
  /** Se déclarer sur une autre page, sans quitter le canal. */
  move: (pageId: string) => void;
  /** Quitter. À appeler AU DÉMONTAGE, sans exception. */
  close: () => void;
}

/**
 * Rejoint la présence du projet et s'y déclare.
 *
 * `onChange` reçoit à chaque mouvement les AUTRES, jamais soi — pas même depuis
 * un autre onglet.
 *
 * Le tri se fait ici plutôt que chez chaque appelant, et c'est le sens même de
 * l'indicateur qui l'impose : il répond « je ne suis pas seul », et une réponse
 * qui compte le lecteur est fausse quoi qu'elle affiche. Un deuxième onglet à
 * soi allumait une pastille dans l'arbre en face d'une page que personne d'autre
 * ne lisait — la présence disait quelque chose, et ce quelque chose était faux.
 * Filtrer chez l'appelant demandait à chacun de se souvenir de qui il est ;
 * celui de l'arbre ne le savait même pas.
 *
 * Le token est poussé sur la socket AVANT le join, comme partout ailleurs dans
 * ce dépôt : un canal privé rejoint avec le jeton anon est refusé, en silence.
 */
export function openPagePresence({
  projectId,
  userId,
  pageId,
  onChange,
  client,
}: {
  projectId: string;
  userId: string;
  pageId: string;
  onChange: (present: PagePresenceMap) => void;
  client?: PresenceClient;
}): PagePresenceHandle {
  const supabase = (client ?? getSupabase()) as PresenceClient;
  let channel: RealtimeChannel | null = null;
  let closed = false;
  let current = pageId;

  const publish = (ch: RealtimeChannel) => {
    const state = ch.presenceState<PagePresenceState>();
    const pages: PagePresenceMap = new Map();
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        if (!entry?.pageId || !entry.userId) continue;
        // Soi, sous toutes ses connexions : la présence dit qui d'AUTRE lit.
        if (entry.userId === userId) continue;
        const people = pages.get(entry.pageId);
        // Un même compte ouvert deux fois sur la même page n'est qu'un avatar.
        if (people) {
          if (!people.includes(entry.userId)) people.push(entry.userId);
        } else {
          pages.set(entry.pageId, [entry.userId]);
        }
      }
    }
    onChange(pages);
  };

  void supabase.realtime.setAuth().then(() => {
    // Parti pendant que le token montait : ne rejoindre rien. C'est le cas
    // qu'un démontage rapide (on ouvre une page, on en ouvre une autre)
    // produit à tous les coups.
    if (closed) return;
    // Pas de `presence.key` : la clé par défaut est celle de la CONNEXION, donc
    // deux onglets du même compte sont deux entrées distinctes. Une clé bâtie
    // sur l'utilisateur les ferait se recouvrir, et fermer l'un retirerait
    // l'avatar de l'autre. Le dédoublonnage se fait à la lecture (`publish`),
    // là où il ne coûte rien.
    const ch = supabase.channel(pagePresenceTopic(projectId), {
      config: { private: true },
    });
    ch.on("presence", { event: "sync" }, () => publish(ch));
    ch.subscribe((status) => {
      if (status !== "SUBSCRIBED" || closed) return;
      void ch.track({ userId, pageId: current } satisfies PagePresenceState);
    });
    channel = ch;
  });

  return {
    move: (next: string) => {
      current = next;
      if (channel && !closed) {
        void channel.track({ userId, pageId: next } satisfies PagePresenceState);
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      if (channel) {
        const ch = channel;
        channel = null;
        // `untrack` d'abord : `removeChannel` ferme la socket côté client, mais
        // c'est le `leave` explicite qui retire l'avatar chez les AUTRES tout
        // de suite plutôt qu'à l'expiration du présentiel.
        void ch.untrack();
        void supabase.removeChannel(ch);
      }
    },
  };
}
