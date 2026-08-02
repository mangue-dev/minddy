/**
 * Affinité de déploiement des runs de l'agent (MIN-165). PUR et testable — comme
 * `command-guard` : la politique ici, les mains dans `drain.ts` et la route cron.
 *
 * Preview et production partagent une seule base, donc une seule file de runs. Le
 * drain claim n'importe quel run `queued` et le cron ne tourne qu'en prod : un run
 * lancé depuis un preview repart, à la première frontière de chunk, sur le code de
 * la prod — même checkpoint, même microVM, jeu de tools différent. Le remède est
 * un TAMPON posé à la création : chaque drain ne claim que son propre périmètre,
 * et le cron de prod se contente de réveiller les déploiements qui ont du travail.
 */

/** Nombre de déploiements preview réveillés par tick de cron. Le reliquat attend
 *  le tick suivant (2 min) — le nombre de previews qui drainent EN MÊME TEMPS se
 *  compte sur une main, et le plafond garde le répartiteur borné. */
export const PREVIEW_KICK_MAX_TARGETS = 5;

/** Au-delà, un run preview dû et jamais repris est déclaré orphelin : son
 *  déploiement a été supprimé, ou ne répond plus. Large devant les 2 min du cron
 *  et devant un chunk de 13 min qui aurait raté son propre chaînage. */
export const PREVIEW_STALE_AFTER_MS = 15 * 60_000;

/**
 * Périmètre de drain du déploiement décrit par `env`.
 *
 * `null` = la file commune, drainée par le cron de prod : la production, et le
 * local (pas de `VERCEL_ENV`), dont le drain lancé depuis le poste doit continuer
 * de reprendre les runs de prod — c'est la recette de lancement en vigueur.
 *
 * Sinon l'URL du déploiement EXACT (`VERCEL_URL`) et pas celle de la branche : un
 * run continue avec le code qui l'a lancé, même si on repousse la branche entre
 * deux chunks.
 */
export function deploymentScopeFromEnv(
  env: Record<string, string | undefined>,
): string | null {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (!vercelEnv || vercelEnv === "production") return null;
  return env.VERCEL_URL?.trim() || null;
}

/** `deploymentScopeFromEnv` appliqué au processus courant. */
export function currentDeploymentScope(): string | null {
  return deploymentScopeFromEnv(process.env);
}

/** Ligne de file lue par le répartiteur (cf. la route cron). */
export interface QueuedRunRow {
  id: string;
  deployment_url: string | null;
  not_before: string;
}

/**
 * Répartition d'un tick de cron de prod : les déploiements à réveiller, et les
 * runs dont le déploiement ne répond plus.
 *
 * Un run orphelin ne compte PAS pour son URL : réveiller un déploiement supprimé
 * n'aboutit à rien. Un autre run récent sur la même URL, lui, sera bien kické —
 * c'est ce qui distingue un déploiement mort d'un run isolé qui a raté son tour.
 */
export function previewKickTargets(
  rows: QueuedRunRow[],
  opts: { now: number; staleAfterMs: number },
): { urls: string[]; stalledRunIds: string[] } {
  const urls: string[] = [];
  const seen = new Set<string>();
  const stalledRunIds: string[] = [];
  for (const row of rows) {
    const url = row.deployment_url?.trim();
    if (!url) continue; // run de la file commune — la prod vient de le drainer
    const dueAt = Date.parse(row.not_before);
    // `not_before` illisible : on réveille, on ne condamne pas. Déclarer orphelin
    // détruit un run ; se tromper dans ce sens-là ne coûte qu'un POST.
    if (Number.isFinite(dueAt) && opts.now - dueAt > opts.staleAfterMs) {
      stalledRunIds.push(row.id);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return { urls: urls.slice(0, PREVIEW_KICK_MAX_TARGETS), stalledRunIds };
}
