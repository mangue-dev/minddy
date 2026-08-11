import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import type { PageWriteKind } from "@/lib/pages";

/**
 * Ce qu'une page RACONTE quand elle change (MIN-278) : sa ligne d'activité, et
 * la notification de l'écriture d'agent.
 *
 * Deux surfaces bien distinctes, et c'est la décision de fond du ticket :
 *
 *   • l'ACTIVITÉ se consulte. Elle porte tout — créée, modifiée, mise à la
 *     corbeille, restaurée —, avec son auteur, et elle vit dans le journal
 *     existant (`issue_events`, polymorphe depuis les objectifs), avec une
 *     quatrième colonne de parent. Une table `page_events` parallèle aurait
 *     redemandé son API, son hydratation d'acteurs et son rendu.
 *   • une NOTIFICATION interrompt. Il n'y en a donc AUCUNE pour « quelqu'un a
 *     modifié une page » : ce serait du bruit à quatre et un déluge à dix. Seule
 *     l'écriture de l'AGENT en produit une, et seulement pour celui qui a lancé
 *     le run — pas pour le projet.
 */

/** Les gestes qu'une page enregistre. */
export type PageEventType =
  | "page_created"
  | "page_updated"
  | "page_trashed"
  | "page_restored";

/**
 * La fenêtre de coalescence de l'ACTIVITÉ, la même que celle de l'historique
 * (`VERSION_COALESCE_MS`, lib/server/pages.ts) et pour la même raison :
 * l'éditeur enregistre une seconde après la dernière frappe, donc un après-midi
 * d'écriture ferait mille lignes. Une même personne, sur une même page, en pose
 * une par tranche de cinq minutes.
 *
 * Ce que la fenêtre ne recouvre jamais : un changement d'auteur, ni de nature
 * de geste. « L'agent est passé après moi » est exactement ce qu'on vient lire.
 */
const EVENT_COALESCE_MS = 5 * 60_000;

/** Seul « modifiée » se répète assez pour mériter d'être coalescé — on ne crée
    ni ne corbeille une page quarante fois de suite. */
const COALESCED: readonly PageEventType[] = ["page_updated"];

/**
 * Pose la ligne d'activité d'un geste sur une page.
 *
 * Deux colonnes disent la NATURE du geste, et ce n'est pas une redondance :
 *
 *   • `via_assistant` nomme l'ACTEUR. Une écriture d'agent porte l'id du compte
 *     qui l'a permise, et sans ce drapeau la ligne dirait « Clément a modifié
 *     cette page » d'un texte que Clément n'a pas écrit — c'est le vocabulaire
 *     que la timeline emploie déjà pour un geste automatisé, et il applique ici
 *     la même règle d'identité que l'historique de MIN-277 à ses versions ;
 *   • `field` porte la nature en clair (« human » / « agent ») et sert à la
 *     COALESCENCE ci-dessous : la fenêtre de cinq minutes ne doit jamais avaler
 *     un changement de nature. « L'agent est passé après moi » est exactement
 *     ce qu'on vient lire.
 *
 * Best-effort de bout en bout : une activité qu'on n'a pas su écrire ne doit
 * jamais faire échouer l'écriture de la page.
 */
export async function recordPageEvent(
  service: SupabaseClient,
  params: {
    pageId: string;
    actorId: string | null;
    kind: PageWriteKind;
    type: PageEventType;
    /** La clé MCP derrière le geste, quand il vient de là : la ligne nomme alors
        l'agent de la clé — « Claude Code (mcp) » —, exactement comme la timeline
        d'un ticket écrit par le même agent. `via_assistant` prend le relais
        sinon, et la ligne dit « Numo ». */
    mcpKeyId?: string | null;
  },
): Promise<void> {
  const { pageId, actorId, kind, type, mcpKeyId } = params;

  if (COALESCED.includes(type)) {
    const { data } = await service
      .from("issue_events")
      .select("id")
      .eq("page_id", pageId)
      .eq("type", type)
      .eq("field", kind)
      // `actor_id` peut être null (aucun geste de page ne l'est aujourd'hui,
      // mais la colonne l'autorise) : `eq` ne matche pas NULL en SQL, d'où la
      // branche — sans elle, deux gestes anonymes ne se coalesceraient jamais.
      .filter("actor_id", actorId ? "eq" : "is", actorId ?? null)
      .gte("created_at", new Date(Date.now() - EVENT_COALESCE_MS).toISOString())
      .limit(1);
    if (data && data.length > 0) return;
  }

  await insertEvents(service, [
    {
      page_id: pageId,
      actor_id: actorId,
      type,
      field: kind,
      // Les deux ne se cumulent PAS : la timeline teste `via_assistant` AVANT
      // `via_mcp` (components/issue-timeline.tsx), donc les porter tous les deux
      // ferait dire « Numo » d'un geste dont on connaît l'agent par son nom.
      via_assistant: kind === "agent" && !mcpKeyId,
      ...(mcpKeyId ? { via_mcp: true, api_key_id: mcpKeyId } : {}),
    },
  ]);
}

/**
 * Prévient le lanceur d'un run que l'AGENT vient d'écrire dans une page.
 *
 * `actorId` EST le destinataire, et ce n'est pas une bizarrerie : les six outils
 * d'écriture de page tournent sous l'id du compte qui les a permis — le porteur
 * de la clé MCP, l'utilisateur de Numo, le propriétaire du projet. C'est donc la
 * seule personne à prévenir, et prévenir tout le projet d'un geste que personne
 * n'a demandé serait exactement le bruit que ce ticket cherche à éviter.
 *
 * `actor_id` reste NULL sur la ligne : l'acteur n'est pas une personne, c'est
 * l'agent. Le laisser rempli ferait afficher au destinataire son propre portrait
 * à côté de « quelqu'un a écrit dans cette page ».
 *
 * `replaceUnread` : un run qui repasse dix fois sur la même page ne laisse
 * qu'une ligne — c'est le même mécanisme que les notifications de run, et il est
 * borné à la page par la clause `page_id` d'`insertNotifications`.
 */
export async function notifyAgentPageWrite(
  service: SupabaseClient,
  params: { projectId: string; pageId: string; actorId: string },
): Promise<void> {
  await insertNotifications(
    service,
    [
      {
        user_id: params.actorId,
        project_id: params.projectId,
        type: "page_agent_edit" as const,
        issue_id: null,
        page_id: params.pageId,
        actor_id: null,
      },
    ],
    { replaceUnread: true },
  );
}
