/**
 * captures/ — configuration et périmètre autorisé.
 *
 * Ce fichier est la SOURCE DE VÉRITÉ du périmètre d'écriture. Aucune écriture
 * en base ne peut sortir de ce qui est déclaré ici. Élargir le périmètre est
 * une décision délibérée : il faut modifier ce fichier, et donc le voir passer
 * dans un diff Git.
 */

/**
 * Le compte de démo. Tout ce que les scripts de capture créent lui appartient.
 * Le motif sert de garde-fou : on refuse de supprimer un utilisateur dont
 * l'email ne correspond pas.
 */
export const DEMO_EMAIL = "captures-demo@minddy.app";
export const DEMO_EMAIL_PATTERN = /^captures-demo(\+[a-z0-9-]+)?@minddy\.app$/;

/**
 * Tables dans lesquelles les scripts de capture ont le droit d'INSÉRER.
 *
 *  ownerColumn    — colonne qui rattache la ligne au compte de démo.
 *                   Doit valoir un id de la famille de démo, sinon rejet.
 *  projectColumn  — si présente, la ligne doit viser un projet de démo.
 *  userRefColumns — toute colonne pointant vers auth.users : si non nulle,
 *                   elle doit viser un membre de la famille de démo.
 *                   Empêche d'assigner un ticket à un vrai utilisateur.
 */
export const WRITABLE_TABLES = {
  projects: {
    ownerColumn: "owner_id",
    userRefColumns: ["owner_id"],
  },
  project_members: {
    ownerColumn: "user_id",
    projectColumn: "project_id",
    userRefColumns: ["user_id", "added_by"],
  },
  issues: {
    ownerColumn: "created_by",
    projectColumn: "project_id",
    userRefColumns: ["created_by", "assignee_id"],
  },
};

/**
 * Seules fonctions RPC appelables. `next_issue_number` incrémente le compteur
 * d'un projet — on vérifie avant l'appel que le projet est un projet de démo.
 */
export const ALLOWED_RPC = new Set(["next_issue_number"]);

/** Enums réels du schéma. Toute valeur hors liste casse un CHECK côté base. */
export const ISSUE_STATUS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
export const ISSUE_PRIORITY = ["none", "urgent", "high", "medium", "low"];
export const ISSUE_EFFORT = ["xs", "s", "m", "l", "xl"];

/** Réglages de capture. */
export const CAPTURE = {
  baseUrl: process.env.CAPTURE_BASE_URL || "http://localhost:3000",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  /** Instant figé : toute date relative affichée est stable d'un run à l'autre. */
  frozenNow: "2026-07-15T10:30:00.000Z",
};
