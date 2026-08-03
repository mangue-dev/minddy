import "server-only";

import { isEffort, isPriority } from "@/lib/issue-validation";
import { MAX_TITLE_LENGTH, normalizeToken } from "@/lib/import/normalize";
import type { ImportedIssue } from "@/lib/import/types";
import {
  MAX_SEED_DISTINCT_LABELS,
  MAX_SEED_ISSUES,
  MAX_SEED_LABELS,
  MAX_SEED_OBJECTIVES,
  type SeedIssue,
  type SeedObjective,
  type SeedProposal,
} from "@/lib/seed/types";

/**
 * La porte de l'amorce par brief (MIN-172) : ce qui vient du navigateur n'est
 * jamais cru.
 *
 * L'aperçu est modifiable — titres réécrits, tickets décochés, objectifs
 * abandonnés — donc le corps du commit est un objet que l'utilisateur a
 * fabriqué, dans un onglet qu'on ne contrôle pas. Il repasse ici entier :
 * énumérations validées (`isPriority`, `isEffort`), titres tronqués comme ceux
 * d'un import, plafonds de lot, clés d'objectif et de parent résolues CONTRE
 * LE LOT — une clé qui ne désigne rien du lot est simplement lâchée, jamais
 * suivie.
 *
 * La proposition du modèle passe par la même fonction (`brief-to-issues.ts`) :
 * une seule porte, donc l'aperçu ne peut pas montrer un ticket que l'écriture
 * refuserait ensuite.
 */

/** Longueur d'une description proposée — quelques lignes, pas un document. */
const MAX_DESCRIPTION_LENGTH = 10_000;
/** Résumé d'objectif : deux phrases. */
const MAX_SUMMARY_LENGTH = 2_000;
/** Une clé synthétique de lot ("O1", "T14") — jamais un identifiant réel. */
const MAX_KEY_LENGTH = 40;
const MAX_LABEL_LENGTH = 60;

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Nettoie une proposition, d'où qu'elle vienne. Ne lève jamais et ne rejette
 * jamais le lot entier : chaque entrée invalide est écartée seule, parce qu'un
 * ticket mal formé ne doit pas coûter les trente-neuf autres.
 */
export function sanitizeSeedProposal(raw: unknown): SeedProposal {
  const input = (raw ?? {}) as { objectives?: unknown; issues?: unknown };

  // ── Objectifs : clés uniques, un nom obligatoire ──
  const objectives: SeedObjective[] = [];
  const objectiveKeys = new Set<string>();
  for (const entry of asRecords(input.objectives)) {
    if (objectives.length >= MAX_SEED_OBJECTIVES) break;
    const key = text(entry.key, MAX_KEY_LENGTH);
    const name = text(entry.name, MAX_TITLE_LENGTH);
    const token = normalizeToken(key);
    if (!token || !name || objectiveKeys.has(token)) continue;
    objectiveKeys.add(token);
    objectives.push({ key, name, summary: text(entry.summary, MAX_SUMMARY_LENGTH) });
  }
  const objectiveKeyByToken = new Map(
    objectives.map((objective) => [normalizeToken(objective.key), objective.key])
  );

  // ── Tickets : deux passes, parce qu'un parent peut être cité avant d'exister ──
  const issues: SeedIssue[] = [];
  const issueKeys = new Set<string>();
  for (const entry of asRecords(input.issues)) {
    if (issues.length >= MAX_SEED_ISSUES) break;
    const key = text(entry.key, MAX_KEY_LENGTH);
    const title = text(entry.title, MAX_TITLE_LENGTH);
    const token = normalizeToken(key);
    // Sans clé ou sans titre, il n'y a pas de ticket ; une clé en double
    // écraserait la première dans la table de résolution des parents.
    if (!token || !title || issueKeys.has(token)) continue;
    issueKeys.add(token);

    issues.push({
      key,
      title,
      description: text(entry.description, MAX_DESCRIPTION_LENGTH),
      objectiveKey: objectiveKeyByToken.get(normalizeToken(text(entry.objectiveKey, MAX_KEY_LENGTH))) ?? "",
      priority: isPriority(entry.priority) ? entry.priority : "none",
      effort: isEffort(entry.effort) ? entry.effort : null,
      // Résolue à la passe suivante, une fois le lot connu en entier.
      parentKey: text(entry.parentKey, MAX_KEY_LENGTH),
      labels: sanitizeLabels(entry.labels),
    });
  }

  // Les parents, en deux passes comme à l'import (`lib/import/parse.ts`) :
  // d'abord les clés qui ne désignent rien du lot retenu (ou soi-même), puis
  // celles dont le parent est lui-même un sous-ticket — un seul niveau.
  const byToken = new Map(issues.map((issue) => [normalizeToken(issue.key), issue]));
  for (const issue of issues) {
    if (!issue.parentKey) continue;
    const parent = byToken.get(normalizeToken(issue.parentKey));
    issue.parentKey = !parent || parent === issue ? "" : parent.key;
  }
  for (const issue of issues) {
    if (!issue.parentKey) continue;
    const parent = byToken.get(normalizeToken(issue.parentKey))!;
    if (parent.parentKey) issue.parentKey = "";
  }

  keepTopLabels(issues);

  return { objectives, issues };
}

/**
 * Les étiquettes qui deviendront des catégories : les plus PORTÉES du lot, et
 * six au maximum.
 *
 * Un modèle étiquette au fil de sa lecture — il rend une étiquette par sujet
 * qu'il croise. Mesuré sur un vrai brief : treize catégories pour vingt-deux
 * tickets, dont neuf portées une seule fois. Un projet qui vient de naître ne
 * doit pas ouvrir son picker sur treize entrées dont personne ne se sert.
 *
 * Un plafond, et rien d'autre : « écarter ce qu'un seul ticket porte » se
 * défend sur vingt tickets, mais viderait les étiquettes d'un lot de trois. Le
 * plafond, lui, ne mord que là où il y a effectivement trop de catégories.
 * Rien n'est perdu : ce que l'étiquette disait est dans le titre et la
 * description. À fréquence égale, l'ordre d'apparition tranche — le résultat
 * est stable.
 */
function keepTopLabels(issues: SeedIssue[]): void {
  const counts = new Map<string, { count: number; rank: number }>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      const token = normalizeToken(label);
      const entry = counts.get(token);
      if (entry) entry.count += 1;
      else counts.set(token, { count: 1, rank: counts.size });
    }
  }
  if (counts.size <= MAX_SEED_DISTINCT_LABELS) return;

  const kept = new Set(
    [...counts.entries()]
      .sort(([, a], [, b]) => b.count - a.count || a.rank - b.rank)
      .slice(0, MAX_SEED_DISTINCT_LABELS)
      .map(([token]) => token)
  );
  for (const issue of issues) {
    issue.labels = issue.labels.filter((label) => kept.has(normalizeToken(label)));
  }
}

/**
 * La proposition validée, telle que le chemin d'import l'écrit. Statut
 * `backlog` : l'utilisateur vient de relire chaque ticket dans l'aperçu, le
 * faire repasser par le triage lui redemanderait le geste qu'il vient de faire.
 *
 * `objectiveIdByKey` porte les objectifs RÉELLEMENT créés : une clé absente
 * (objectif décoché, création ratée) laisse le ticket sans objectif plutôt que
 * de faire échouer le lot.
 */
export function seedProposalToImportedIssues(
  proposal: SeedProposal,
  objectiveIdByKey: Map<string, string>
): ImportedIssue[] {
  return proposal.issues.map((issue) => ({
    title: issue.title,
    description: issue.description || null,
    status: "backlog" as const,
    priority: issue.priority,
    effort: issue.effort,
    labels: issue.labels,
    assigneeId: null,
    dueDate: null,
    createdAt: null,
    completedAt: null,
    // La clé du lot devient la clé externe : c'est par elle que l'import
    // rattache les sous-tickets, sans qu'aucun identifiant réel n'ait circulé.
    externalKeys: [issue.key],
    parentExternalKey: issue.parentKey || null,
    objectiveId: objectiveIdByKey.get(issue.objectiveKey) ?? null,
  }));
}

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (labels.length >= MAX_SEED_LABELS) break;
    const label = text(value, MAX_LABEL_LENGTH);
    const token = normalizeToken(label);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    labels.push(label);
  }
  return labels;
}

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    : [];
