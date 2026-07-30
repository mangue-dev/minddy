/**
 * Combien de temps un élément supprimé reste rattrapable (MIN-133).
 *
 * Module à part, sans `server-only` ni `"use client"` : la valeur est lue des
 * DEUX côtés — par le balayage nocturne qui efface pour de bon
 * (lib/server/retention.ts) et par les phrases qui promettent le délai à
 * l'écran (« restaurable pendant 30 jours »). Les laisser vivre séparément,
 * c'est se garantir qu'un jour l'app promet un délai que le cron ne tient plus.
 */
export const TRASH_RETENTION_DAYS = 30;
