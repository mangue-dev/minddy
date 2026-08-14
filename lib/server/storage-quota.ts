import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Le plafond de stockage d'un compte, côté serveur (MIN-348).
 *
 * La VRAIE application du quota est en SQL — dans la policy `attachments
 * insert` (migration 20261229090000), parce que l'envoi d'une pièce jointe part
 * du navigateur droit vers le bucket sans traverser aucune de nos routes.
 *
 * Ce module sert les écritures qui, elles, passent par le SERVEUR : le fichier
 * de page, la pièce jointe déposée par un agent MCP. Elles utilisent le client
 * de service, qui contourne RLS — donc la policy ne les voit pas, et sans ce
 * relais elles seraient le trou dans le plafond qu'on vient de poser.
 *
 * Une seule définition du verdict pour autant : les deux chemins appellent la
 * MÊME fonction SQL. Ici on ne fait que la demander.
 */

/**
 * `false` quand le propriétaire de ce projet a rempli son quota.
 *
 * En cas d'erreur base, on répond `true` : un incident de lecture ne doit pas
 * bloquer l'écriture d'un utilisateur en règle, et la policy reste le filet
 * pour tout ce qui vient du navigateur.
 */
export async function projectStorageAllowed(
  service: SupabaseClient,
  projectId: string
): Promise<boolean> {
  const { data, error } = await service.rpc("project_storage_quota_ok", {
    p_project: projectId,
  });
  if (error) {
    console.error("[storage-quota] check failed:", error.message);
    return true;
  }
  return data !== false;
}
