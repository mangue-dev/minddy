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
 * Comment chaque table se rattache au monde de démo.
 *
 * Une ligne n'est « à nous » que si TOUS les ancrages déclarés ici sont
 * satisfaits. Une table sans aucun ancrage est refusée à la déclaration : sans
 * ancrage, rien ne distinguerait une ligne de démo d'une ligne réelle.
 *
 *  writable       — false = la table sert seulement de point d'ancrage (on la
 *                   lit pour valider les enfants), on n'y écrit jamais.
 *  ownerColumn    — colonne pointant `auth.users` qui rattache la ligne au
 *                   compte de démo. Doit valoir un id de la famille de démo.
 *  projectColumn  — colonne pointant `projects` : doit viser un projet de démo.
 *  userRefColumns — toute autre colonne pointant `auth.users` : si non nulle,
 *                   elle doit viser un membre de la famille de démo. C'est ce
 *                   qui empêche d'assigner un ticket à un vrai utilisateur.
 *  parents        — rattachement indirect : la valeur doit être l'id d'une
 *                   ligne DÉJÀ PROUVÉE de démo dans la table parente. C'est
 *                   ainsi que les tables sans project_id ni user_id (votes,
 *                   messages, events) restent enfermées dans le périmètre.
 *
 * L'ordre de déclaration est un ordre de dépendance : un parent est toujours
 * déclaré avant ses enfants, parce que `openDemoWorld` résout les identifiants
 * de démo table par table, dans cet ordre.
 *
 * Conséquence pratique pour les scripts : un enfant ne peut être inséré
 * qu'APRÈS que son parent a été appliqué (un `plan.apply()` rafraîchit le
 * monde). Insérer un post et ses votes dans le même plan échoue — et c'est
 * volontaire, c'est ce qui rend la vérification possible.
 */
export const TABLE_SCOPES = {
  // ── Socle ────────────────────────────────────────────────────────────────
  projects: {
    writable: true,
    ownerColumn: "owner_id",
    userRefColumns: ["owner_id"],
  },
  project_members: {
    writable: true,
    ownerColumn: "user_id",
    projectColumn: "project_id",
    userRefColumns: ["user_id", "added_by"],
  },
  issues: {
    writable: true,
    ownerColumn: "created_by",
    projectColumn: "project_id",
    userRefColumns: ["created_by", "assignee_id"],
  },
  /** Créées par un trigger à la naissance du projet — ancrage seul, jamais écrites. */
  categories: {
    writable: false,
    projectColumn: "project_id",
  },

  // ── Plan du compte ───────────────────────────────────────────────────────
  // `admin_override_plan_id` est le levier prévu par le schéma pour offrir un
  // plan sans passer par Stripe (« offrir Pro à un testeur »), et il est
  // PRIORITAIRE sur l'état Stripe (resolvePlanFromBillingAccount). On n'écrit
  // que cette colonne : aucune ligne Stripe n'est créée, aucun paiement, aucun
  // abonnement. Le compte de démo a besoin de Pro parce que le plan `free`
  // ferme les agents ET les pull requests derrière `AgentsPlanGate`.
  billing_accounts: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Avatar ───────────────────────────────────────────────────────────────
  // La graine du portrait généré (lib/avatar.ts). Écrivable parce qu'un board
  // photographié doit montrer des personnes qu'on distingue : le tirage étant
  // aléatoire, deux membres peuvent tomber sur des fonds voisins, et le seul
  // remède prévu par le produit est d'en retirer un nouveau.
  user_avatars: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Cycle et carnet : personnels, cross-projet ───────────────────────────
  cycles: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
  },
  user_scratchpad: {
    writable: true,
    ownerColumn: "user_id",
    userRefColumns: ["user_id"],
    idColumn: "user_id",
  },

  // ── Numo (l'assistant) ───────────────────────────────────────────────────
  conversations: {
    writable: true,
    ownerColumn: "user_id",
    projectColumn: "project_id",
    userRefColumns: ["user_id"],
  },
  assistant_messages: {
    writable: true,
    parents: [{ column: "conversation_id", table: "conversations" }],
  },

  // ── Agent de code ────────────────────────────────────────────────────────
  // Aucun run de démo ne doit être `queued` ni `running` : le cron de drain
  // claim les `queued`, et `requeueStuckRuns` remet en file tout `running` de
  // plus de 6 minutes — ce qui EXÉCUTERAIT réellement l'agent (sandbox, appels
  // LLM facturés, écriture sur un dépôt). Voir lib/server/agent/runs.ts.
  agent_runs: {
    writable: true,
    projectColumn: "project_id",
    userRefColumns: ["created_by"],
    parents: [{ column: "issue_id", table: "issues" }],
  },
  agent_run_events: {
    writable: true,
    parents: [{ column: "run_id", table: "agent_runs" }],
  },

  // ── Feedback (board public + vue équipe) ─────────────────────────────────
  // Tout post de démo doit porter `analyzed_at` ET `classified_at` non nuls :
  // la passe IA horaire (app/api/cron/feedback-analysis) ne réclame que les
  // posts dont ces colonnes sont nulles. Sans ça, le cron appellerait un modèle
  // sur nos données de démo, et ce serait facturé.
  feedback_boards: {
    writable: true,
    projectColumn: "project_id",
  },
  feedback_users: {
    writable: true,
    projectColumn: "project_id",
  },
  feedback_posts: {
    writable: true,
    projectColumn: "project_id",
    userRefColumns: ["created_by_member"],
  },
  feedback_votes: {
    writable: true,
    parents: [
      { column: "post_id", table: "feedback_posts" },
      { column: "user_id", table: "feedback_users" },
    ],
  },
  feedback_post_categories: {
    writable: true,
    parents: [
      { column: "post_id", table: "feedback_posts" },
      { column: "category_id", table: "categories" },
    ],
  },
};

/** Les tables où l'on a le droit d'écrire — sous-ensemble strict de TABLE_SCOPES. */
export const WRITABLE_TABLES = Object.fromEntries(
  Object.entries(TABLE_SCOPES).filter(([, spec]) => spec.writable),
);

/**
 * Seules fonctions RPC appelables. `next_issue_number` incrémente le compteur
 * d'un projet — on vérifie avant l'appel que le projet est un projet de démo.
 */
export const ALLOWED_RPC = new Set(["next_issue_number"]);

/** Enums réels du schéma. Toute valeur hors liste casse un CHECK côté base. */
export const ISSUE_STATUS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"];
export const ISSUE_PRIORITY = ["none", "urgent", "high", "medium", "low"];
export const ISSUE_EFFORT = ["xs", "s", "m", "l", "xl"];

/** Points par effort — miroir de EFFORT_POINTS dans lib/cycle.ts. */
export const EFFORT_POINTS = { xs: 1, s: 2, m: 3, l: 5, xl: 8 };

/** Statuts d'un post de feedback, et états de revue. */
export const FEEDBACK_STATUS = ["open", "planned", "in_progress", "shipped", "declined"];
export const FEEDBACK_REVIEW_STATE = ["pending", "published", "rejected"];

/** Types d'événements d'un run d'agent. */
export const AGENT_EVENT_TYPES = [
  "status", "thinking", "tool_call", "tool_result", "commit", "pr_opened",
  "error", "summary", "user_message", "plan_update", "files_changed", "question",
];

/** Réglages de capture. */
export const CAPTURE = {
  baseUrl: process.env.CAPTURE_BASE_URL || "http://localhost:3000",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  /** Instant figé : toute date relative affichée est stable d'un run à l'autre. */
  frozenNow: "2026-07-15T10:30:00.000Z",
};
