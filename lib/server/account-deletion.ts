import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { cancelStripeSubscription, isStripeConfigured } from "@/lib/server/stripe";

/**
 * Suppression de compte (MIN-119, RGPD art. 17 — droit à l'effacement).
 *
 * Immédiate et définitive : pas de corbeille, pas de délai de grâce. Le schéma
 * est déjà fait pour ça — `auth.users` cascade sur tout ce qui est personnel et
 * met à NULL les colonnes d'auteur, de sorte que le fil d'un ticket partagé
 * reste lisible sans plus désigner personne.
 *
 * LA conséquence à ne jamais taire : `projects.owner_id … on delete cascade`.
 * Supprimer son compte détruit les projets dont on est propriétaire, avec leurs
 * tickets, leurs fichiers et l'accès de leurs autres membres. C'est le rôle de
 * `previewAccountDeletion()` de le chiffrer AVANT que la personne confirme —
 * un effacement irréversible n'est acceptable que s'il a été annoncé.
 *
 * L'ordre des opérations compte : ce que la cascade n'emporte pas doit partir
 * d'abord, sinon on perd la trace de ce qu'il fallait nettoyer.
 *   1. l'abonnement Stripe (aucune raison de continuer à prélever) ;
 *   2. les objets de stockage (les LIGNES cascadent, pas les FICHIERS) ;
 *   3. le compte lui-même, qui emporte le reste.
 */

type Service = ReturnType<typeof getServiceClient>;

export interface DeletionPreview {
  /** Projets qui seront détruits — ceux dont la personne est propriétaire. */
  ownedProjects: Array<{ id: string; name: string; memberCount: number }>;
  /** Tickets contenus dans ces projets. */
  issueCount: number;
  /** Membres d'autres comptes qui perdront leur accès. */
  affectedMemberCount: number;
  /** Commentaires écrits par la personne, ici comme ailleurs. */
  commentCount: number;
  /** Un abonnement payant est-il en cours ? */
  hasActiveSubscription: boolean;
}

/** Ce que la suppression détruira, chiffré, pour l'écran de confirmation. */
export async function previewAccountDeletion(userId: string): Promise<DeletionPreview> {
  const service = getServiceClient();

  const { data: projects } = await service
    .from("projects")
    .select("id, name")
    .eq("owner_id", userId)
    .is("deleted_at", null);

  const ownedIds = (projects ?? []).map((p) => p.id as string);

  const [members, issues, comments, billing] = await Promise.all([
    ownedIds.length
      ? service.from("project_members").select("project_id, user_id").in("project_id", ownedIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ownedIds.length
      ? service.from("issues").select("id", { count: "exact", head: true }).in("project_id", ownedIds)
      : Promise.resolve({ count: 0 }),
    service.from("comments").select("id", { count: "exact", head: true }).eq("author_id", userId),
    service
      .from("billing_accounts")
      .select("stripe_subscription_id, stripe_subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const memberRows = (members.data ?? []) as Array<{ project_id: string; user_id: string }>;
  const perProject = new Map<string, number>();
  const others = new Set<string>();
  for (const row of memberRows) {
    perProject.set(row.project_id, (perProject.get(row.project_id) ?? 0) + 1);
    if (row.user_id !== userId) others.add(row.user_id);
  }

  const status = billing.data?.stripe_subscription_status as string | undefined;

  return {
    ownedProjects: (projects ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      // +1 : le propriétaire n'a pas de ligne dans project_members.
      memberCount: (perProject.get(p.id as string) ?? 0) + 1,
    })),
    issueCount: issues.count ?? 0,
    affectedMemberCount: others.size,
    commentCount: comments.count ?? 0,
    hasActiveSubscription:
      !!billing.data?.stripe_subscription_id &&
      (status === "active" || status === "trialing" || status === "past_due"),
  };
}

export interface DeletionResult {
  deletedProjects: number;
  removedStorageObjects: number;
  subscriptionCanceled: boolean;
  /** Ce qui n'a pas pu être nettoyé — l'effacement du compte a eu lieu quand
      même, ces lignes servent à finir le ménage à la main. */
  warnings: string[];
}

/** Liste récursivement les objets d'un préfixe (l'API Storage ne descend pas). */
async function listPrefix(
  service: Service,
  bucket: string,
  prefix: string,
  depth = 0
): Promise<string[]> {
  // Garde-fou : une arborescence de pièces jointes est plate ou presque, une
  // récursion sans borne n'aurait ici qu'une cause — une boucle.
  if (depth > 3) return [];

  const { data, error } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const entry of data) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Un « dossier » Storage est une entrée sans métadonnées.
    if (entry.id === null || entry.metadata === null) {
      paths.push(...(await listPrefix(service, bucket, full, depth + 1)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

/** Supprime un lot d'objets, sans jamais faire échouer l'effacement du compte. */
async function removeObjects(
  service: Service,
  bucket: string,
  paths: string[],
  warnings: string[]
): Promise<number> {
  if (paths.length === 0) return 0;
  // Storage plafonne un `remove` : on découpe.
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await service.storage.from(bucket).remove(chunk);
    if (error) warnings.push(`storage ${bucket}: ${error.message}`);
    else removed += chunk.length;
  }
  return removed;
}

/**
 * Efface le compte et tout ce qui s'y rattache. Idempotent dans les faits : un
 * second appel sur un compte déjà parti échoue à l'étape 3 avec un message
 * clair, il ne détruit rien d'autre.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const service = getServiceClient();
  const warnings: string[] = [];

  // ── 1. Abonnement Stripe ────────────────────────────────────────────────
  let subscriptionCanceled = false;
  const { data: billing } = await service
    .from("billing_accounts")
    .select("stripe_subscription_id, stripe_subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const subscriptionId = billing?.stripe_subscription_id as string | undefined;
  const status = billing?.stripe_subscription_status as string | undefined;
  if (subscriptionId && status !== "canceled" && isStripeConfigured()) {
    try {
      await cancelStripeSubscription(subscriptionId);
      subscriptionCanceled = true;
    } catch (e) {
      // On continue : laisser un abonnement pendant est un problème de
      // facturation à régler à la main, pas une raison de refuser un droit.
      warnings.push(`stripe: ${(e as Error).message}`);
    }
  }

  // ── 2. Objets de stockage ───────────────────────────────────────────────
  // Les lignes `attachments` cascadent avec le projet, les FICHIERS non : sans
  // ce passage ils resteraient dans le bucket sans plus rien pour les désigner.
  const { data: projects } = await service
    .from("projects")
    .select("id")
    .eq("owner_id", userId);
  const ownedIds = (projects ?? []).map((p) => p.id as string);

  let removedStorageObjects = 0;

  if (ownedIds.length) {
    const { data: attachments } = await service
      .from("attachments")
      .select("storage_path")
      .in("project_id", ownedIds);
    removedStorageObjects += await removeObjects(
      service,
      "attachments",
      (attachments ?? []).map((a) => a.storage_path as string),
      warnings
    );

    // Icônes de projet : une par projet, extension inconnue → on liste.
    const icons = await listPrefix(service, "project-icons", "");
    const mine = icons.filter((path) => ownedIds.some((id) => path.startsWith(id)));
    removedStorageObjects += await removeObjects(service, "project-icons", mine, warnings);
  }

  // Téléversements du chat de l'assistant : pas de ligne en base, seulement des
  // objets sous `chat/{user_id}/`.
  const chatObjects = await listPrefix(service, "attachments", `chat/${userId}`);
  removedStorageObjects += await removeObjects(service, "attachments", chatObjects, warnings);

  // ── 3. Le compte ────────────────────────────────────────────────────────
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  return {
    deletedProjects: ownedIds.length,
    removedStorageObjects,
    subscriptionCanceled,
    warnings,
  };
}
