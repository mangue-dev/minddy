/**
 * captures/ — couche de sécurité entre les scripts de seed et la base DE PROD.
 *
 * L'INVARIANT, et il tient en une phrase : aucune écriture ne peut atteindre
 * une ligne qui n'appartient pas au monde de démo. Ce n'est pas « on n'écrit
 * que des INSERT » — corriger un titre ou retirer un ticket de démo est
 * parfaitement légitime. Ce qui est interdit, c'est de toucher au reste.
 *
 * Règle absolue : AUCUN script de seed ne parle directement à Supabase.
 * Tout passe par ce module, qui applique les garde-fous suivants :
 *
 *   1. Tables sur liste blanche (captures/lib/config.mjs).
 *   2. Chaque ligne insérée doit être rattachée au monde de démo, par un
 *      propriétaire, un projet, ou une ligne parente elle-même prouvée de
 *      démo. Une ligne qui pointe ailleurs est REJETÉE avant le réseau.
 *   3. Toute modification ou tout retrait relit les lignes visées et vérifie
 *      qu'elles sont bien à nous AVANT d'agir. On ne fait jamais confiance
 *      au filtre.
 *   4. Ni TRUNCATE, ni SQL arbitraire, ni réinitialisation. Aucune exception.
 *   5. Mesure du rayon de souffle : si des lignes hors démo DISPARAISSENT,
 *      on hurle. Une hausse est juste de l'activité concurrente, on l'ignore.
 *   6. Rien ne part sans confirmation explicite.
 *
 * On n'appelle JAMAIS l'API HTTP de l'app pour créer de la donnée. Écrire
 * en base directement court-circuite les routes, et donc le Smart Assign,
 * les notifications, les events PostHog, les emails Resend et la facturation.
 */
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.mjs";
import {
  ALLOWED_RPC,
  DEMO_EMAIL,
  DEMO_EMAIL_PATTERN,
  TABLE_SCOPES,
  WRITABLE_TABLES,
} from "./config.mjs";

/** Client service-role. Contourne RLS — d'où tous les garde-fous ci-dessus. */
function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── Cohérence du périmètre, vérifiée au chargement ───────────────────────────
// Une table sans ancrage laisserait passer n'importe quelle ligne. Un parent
// déclaré après son enfant ne serait pas encore résolu au moment de valider.
// Les deux sont des erreurs de configuration, pas des cas limites : on refuse
// de démarrer plutôt que d'écrire avec un garde-fou troué.
const DECLARATION_ORDER = Object.keys(TABLE_SCOPES);
for (const [table, spec] of Object.entries(TABLE_SCOPES)) {
  const anchors = [spec.ownerColumn, spec.projectColumn, ...(spec.parents || [])];
  if (anchors.filter(Boolean).length === 0) {
    throw new Error(`captures: la table "${table}" n'a aucun ancrage dans config.mjs.`);
  }
  for (const parent of spec.parents || []) {
    if (!TABLE_SCOPES[parent.table]) {
      throw new Error(`captures: "${table}" référence la table "${parent.table}", non déclarée.`);
    }
    if (DECLARATION_ORDER.indexOf(parent.table) >= DECLARATION_ORDER.indexOf(table)) {
      throw new Error(
        `captures: "${table}" doit être déclarée APRÈS son parent "${parent.table}".`,
      );
    }
  }
}

/** Tables servant de parent à au moins une autre : leurs ids doivent être résolus. */
const PARENT_TABLES = new Set(
  Object.values(TABLE_SCOPES).flatMap((spec) => (spec.parents || []).map((p) => p.table)),
);
PARENT_TABLES.add("projects"); // ancrage de `projectColumn`

/**
 * Liste les comptes de la famille de démo.
 *
 * La résolution passe par l'API admin de Supabase Auth, PAS par une table
 * miroir : `public.profiles` a été supprimée (migration 20260706130000) et
 * minddy lit désormais les identités directement dans `auth.users` — même
 * source de vérité que `lib/server/auth-users.ts` côté app.
 */
async function listDemoAccounts(admin) {
  const family = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`captures: lecture des comptes impossible — ${error.message}`);
    for (const user of data.users) {
      if (!DEMO_EMAIL_PATTERN.test(user.email || "")) continue;
      const meta = user.user_metadata || {};
      family.push({
        id: user.id,
        email: user.email,
        full_name: meta.display_name || meta.full_name || meta.name || null,
      });
    }
    if (data.users.length < 200) break;
  }
  return family;
}

/**
 * Applique à une requête les filtres d'ancrage d'une table. Renvoie `null` si
 * un ancrage est vide — auquel cas il n'existe AUCUNE ligne de démo pour cette
 * table, et il ne faut surtout pas lancer une requête sans filtre.
 */
function applyAnchors(query, spec, world) {
  if (spec.projectColumn) {
    const projects = world.demoIds.projects;
    if (!projects || projects.size === 0) return null;
    query = query.in(spec.projectColumn, [...projects]);
  }
  if (spec.ownerColumn) {
    if (world.demoUserIds.size === 0) return null;
    query = query.in(spec.ownerColumn, [...world.demoUserIds]);
  }
  for (const parent of spec.parents || []) {
    const ids = world.demoIds[parent.table];
    if (!ids || ids.size === 0) return null;
    query = query.in(parent.column, [...ids]);
  }
  return query;
}

/**
 * Ouvre le monde de démo : résout le compte, ses projets, et renvoie un
 * handle que les scripts de seed utilisent. Échoue si le compte n'existe pas
 * (c'est `capture-world` qui le crée, délibérément et une seule fois).
 */
export async function openDemoWorld({ allowMissing = false } = {}) {
  const admin = adminClient();

  const family = await listDemoAccounts(admin);
  if (family.length === 0 && !allowMissing) {
    throw new Error(
      `captures: le compte de démo (${DEMO_EMAIL}) n'existe pas encore. ` +
        `Lance le skill capture-world pour le créer.`,
    );
  }

  const world = {
    admin,
    demoUserIds: new Set(family.map((u) => u.id)),
    demoUsers: family,
    /** Identifiants des lignes de démo, par table. Sert d'ancrage aux enfants. */
    demoIds: {},
    demoProjects: [],

    /** Re-résout la famille de démo, ses projets, et tous les ids d'ancrage. */
    async refresh() {
      const fresh = await listDemoAccounts(admin);
      this.demoUsers = fresh;
      this.demoUserIds = new Set(fresh.map((u) => u.id));
      this.demoIds = {};

      // Ordre de déclaration = ordre de dépendance : quand on résout une table,
      // les ids de ses parents sont déjà connus.
      for (const table of DECLARATION_ORDER) {
        if (!PARENT_TABLES.has(table)) continue;
        const spec = TABLE_SCOPES[table];
        const idColumn = spec.idColumn || "id";
        const query = applyAnchors(admin.from(table).select(idColumn), spec, this);
        if (!query) {
          this.demoIds[table] = new Set();
          continue;
        }
        const { data, error } = await query.limit(5000);
        if (error) {
          throw new Error(`captures: résolution des ids de démo sur ${table} — ${error.message}`);
        }
        this.demoIds[table] = new Set((data || []).map((r) => r[idColumn]));
      }

      const { data, error } = this.demoUserIds.size
        ? await admin
            .from("projects")
            .select("id, name, key, deleted_at")
            .in("owner_id", [...this.demoUserIds])
        : { data: [], error: null };
      if (error) throw new Error(`captures: lecture des projets de démo — ${error.message}`);
      this.demoProjects = data || [];
    },
  };

  // Amorçage : `projects` s'ancre sur les comptes, tout le reste en découle.
  world.demoIds.projects = new Set();
  await world.refresh();
  return world;
}

/**
 * Vérifie qu'une ligne ne peut toucher que le périmètre de démo.
 *
 * Tous les ancrages déclarés doivent passer. Un parent inconnu du monde de
 * démo — parce qu'il n'existe pas, ou parce qu'il appartient à quelqu'un
 * d'autre — fait échouer la validation avant tout accès réseau.
 */
function validateRow(world, table, row, index) {
  const spec = TABLE_SCOPES[table];
  const where = `${table}[${index}]`;

  if (spec.ownerColumn) {
    const owner = row[spec.ownerColumn];
    if (!owner) {
      throw new Error(`captures: ${where} — colonne de rattachement "${spec.ownerColumn}" absente.`);
    }
    if (!world.demoUserIds.has(owner)) {
      throw new Error(
        `captures: ${where} — "${spec.ownerColumn}" ne pointe pas vers le compte de démo. REFUSÉ.`,
      );
    }
  }

  if (spec.projectColumn) {
    const projectId = row[spec.projectColumn];
    if (!projectId) {
      throw new Error(`captures: ${where} — "${spec.projectColumn}" absent.`);
    }
    if (!world.demoIds.projects.has(projectId)) {
      throw new Error(
        `captures: ${where} — "${spec.projectColumn}" vise un projet qui n'appartient pas ` +
          `au compte de démo. REFUSÉ.`,
      );
    }
  }

  for (const parent of spec.parents || []) {
    const value = row[parent.column];
    if (!value) {
      throw new Error(`captures: ${where} — "${parent.column}" absent.`);
    }
    const known = world.demoIds[parent.table];
    if (!known || !known.has(value)) {
      throw new Error(
        `captures: ${where} — "${parent.column}" vise une ligne de ${parent.table} qui n'est pas ` +
          `du monde de démo (ou pas encore appliquée). REFUSÉ.`,
      );
    }
  }

  for (const col of spec.userRefColumns || []) {
    const value = row[col];
    if (value == null) continue;
    if (!world.demoUserIds.has(value)) {
      throw new Error(
        `captures: ${where} — "${col}" vise un utilisateur réel (${value}). REFUSÉ.`,
      );
    }
  }
}

/**
 * Compte, pour chaque table écrivable, les lignes situées HORS du périmètre
 * de démo. Ce vecteur doit être rigoureusement identique avant et après un
 * seed. Tout écart signifie qu'on a touché à de la donnée qui n'est pas à nous.
 *
 * Mesuré par différence (total − démo) plutôt que par un NOT IN : deux
 * comptages d'en-tête, aucune liste d'identifiants à faire transiter, et le
 * résultat reste juste quel que soit le nombre de lignes de démo.
 */
export async function measureBlastRadius(world) {
  const counts = {};
  for (const [table, spec] of Object.entries(WRITABLE_TABLES)) {
    const { count: total, error } = await world.admin
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`captures: comptage impossible sur ${table} — ${error.message}`);

    const scoped = applyAnchors(
      world.admin.from(table).select("*", { count: "exact", head: true }),
      spec,
      world,
    );
    let mine = 0;
    if (scoped) {
      const { count, error: e } = await scoped;
      if (e) throw new Error(`captures: comptage de démo sur ${table} — ${e.message}`);
      mine = count ?? 0;
    }
    counts[table] = (total ?? 0) - mine;
  }
  return counts;
}

/**
 * Compare deux mesures. Seule une BAISSE est alarmante.
 *
 * Une hausse du compte « hors démo » ne peut pas venir de nous : nos écritures
 * sont validées comme appartenant au périmètre de démo, donc elles alimentent
 * le compte « dedans ». Une hausse signifie simplement qu'un vrai utilisateur
 * (ou toi, dans un autre onglet) a créé quelque chose pendant le run. Faire
 * échouer là-dessus produirait de fausses alertes en permanence.
 *
 * Une baisse, en revanche, veut dire que des lignes qui ne sont pas à nous ont
 * disparu. Ça, ça n'arrive jamais normalement.
 */
function diffBlastRadius(before, after) {
  const lost = [];
  const concurrent = [];
  for (const table of Object.keys(before)) {
    if (after[table] < before[table]) {
      lost.push(`${table}: ${before[table]} → ${after[table]} (${before[table] - after[table]} disparues)`);
    } else if (after[table] > before[table]) {
      concurrent.push(`${table}: +${after[table] - before[table]}`);
    }
  }
  return { lost, concurrent };
}

function assertWritable(table) {
  if (!WRITABLE_TABLES[table]) {
    throw new Error(
      `captures: table "${table}" hors liste blanche. ` +
        `Pour l'autoriser, édite captures/lib/config.mjs délibérément.`,
    );
  }
}

/**
 * Lit les lignes visées et vérifie qu'elles appartiennent TOUTES au monde de
 * démo. C'est ce qui rend une modification ou une suppression ciblée sûre :
 * on ne fait jamais confiance au filtre, on regarde les lignes réelles avant
 * de toucher quoi que ce soit.
 */
async function readOwnedRows(world, table, match) {
  const { data, error } = await world.admin.from(table).select("*").match(match);
  if (error) throw new Error(`captures: lecture de ${table} — ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      `captures: aucune ligne ne correspond dans ${table} (${JSON.stringify(match)}). ` +
        `Rien à faire — vérifie l'état dans captures/world/world.md.`,
    );
  }
  data.forEach((row, i) => validateRow(world, table, row, i));
  return data;
}

/**
 * Un plan de modification. On le construit, on le DÉCRIT à l'utilisateur en
 * français, on attend son accord, et seulement ensuite on l'applique.
 *
 * L'invariant du dossier n'est pas « on n'écrit que des INSERT », c'est
 * « aucune écriture ne peut atteindre une ligne qui n'appartient pas au monde
 * de démo ». Corriger un titre ou retirer trois tickets de démo est donc
 * permis, et vérifié ligne par ligne avant exécution.
 */
export function createPlan(world) {
  const steps = [];

  return {
    /** Ajoute des lignes. Rien ne part sur le réseau ici. */
    insert(table, rows, label) {
      assertWritable(table);
      const list = Array.isArray(rows) ? rows : [rows];
      steps.push({ kind: "insert", table, rows: list, label: label || table });
      return this;
    },

    /**
     * Modifie des lignes de démo existantes.
     *   plan.update("issues", { id }, { status: "in_review" }, "passage en revue")
     */
    update(table, match, patch, label) {
      assertWritable(table);
      steps.push({ kind: "update", table, match, patch, label: label || table });
      return this;
    },

    /**
     * Retire des lignes de démo existantes.
     *   plan.remove("issues", { id }, "ticket en trop")
     */
    remove(table, match, label) {
      assertWritable(table);
      steps.push({ kind: "remove", table, match, label: label || table });
      return this;
    },

    /** Résumé en français, destiné à l'utilisateur. Pas de jargon technique. */
    describe() {
      const lines = [];
      for (const step of steps) {
        if (step.kind === "insert") {
          lines.push(`  • Créer ${step.rows.length} × ${step.label}`);
          for (const row of step.rows.slice(0, 5)) {
            const summary =
              row.title || row.name || row.email || row.pseudonym || row.content?.slice(0, 60) ||
              JSON.stringify(row).slice(0, 60);
            const extra = [row.status, row.priority].filter(Boolean).join(", ");
            lines.push(`      - ${summary}${extra ? ` (${extra})` : ""}`);
          }
          if (step.rows.length > 5) lines.push(`      - … et ${step.rows.length - 5} de plus`);
        } else if (step.kind === "update") {
          const changes = Object.entries(step.patch)
            .map(([k, v]) => `${k} → ${v}`)
            .join(", ");
          lines.push(`  • Modifier ${step.label} : ${changes}`);
        } else {
          lines.push(`  • Retirer ${step.label}`);
        }
      }
      return lines.join("\n");
    },

    /** Valide TOUT le plan avant d'écrire quoi que ce soit, puis applique. */
    async apply({ confirmed } = {}) {
      if (confirmed !== true) {
        throw new Error(
          "captures: apply() appelé sans confirmation explicite. " +
            "L'utilisateur doit valider le plan avant toute écriture.",
        );
      }

      // Validation intégrale AVANT la première écriture.
      for (const step of steps) {
        if (step.kind === "insert") {
          step.rows.forEach((row, i) => validateRow(world, step.table, row, i));
        } else {
          step.targets = await readOwnedRows(world, step.table, step.match);
          if (step.kind === "update") {
            // Une modification ne doit jamais faire sortir la ligne du périmètre.
            validateRow(world, step.table, { ...step.targets[0], ...step.patch }, 0);
          }
        }
      }

      const before = await measureBlastRadius(world);
      const inserted = {};

      for (const step of steps) {
        if (step.kind === "insert") {
          const { data, error } = await world.admin.from(step.table).insert(step.rows).select();
          if (error) {
            throw new Error(
              `captures: insertion échouée sur ${step.table} — ${error.message}. ` +
                `Les étapes précédentes ont été appliquées : vérifie l'état avant de relancer.`,
            );
          }
          inserted[step.table] = (inserted[step.table] || []).concat(data || []);
        } else if (step.kind === "update") {
          const { error } = await world.admin.from(step.table).update(step.patch).match(step.match);
          if (error) throw new Error(`captures: modification de ${step.table} — ${error.message}`);
        } else {
          const { error } = await world.admin.from(step.table).delete().match(step.match);
          if (error) throw new Error(`captures: retrait dans ${step.table} — ${error.message}`);
        }
      }

      await world.refresh();
      const after = await measureBlastRadius(world);
      const { lost, concurrent } = diffBlastRadius(before, after);
      if (lost.length > 0) {
        throw new Error(
          `captures: ALERTE — des lignes hors périmètre de démo ont DISPARU :\n  ${lost.join("\n  ")}\n` +
            `Arrête tout et préviens l'utilisateur immédiatement.`,
        );
      }
      if (concurrent.length > 0) {
        console.log(`captures: activité concurrente pendant le run (sans rapport) — ${concurrent.join(", ")}`);
      }

      return inserted;
    },
  };
}

/** Appelle une RPC de la liste blanche, en vérifiant sa cible. */
export async function callRpc(world, name, args) {
  if (!ALLOWED_RPC.has(name)) {
    throw new Error(`captures: RPC "${name}" non autorisée.`);
  }
  if (args?.p_project_id && !world.demoIds.projects.has(args.p_project_id)) {
    throw new Error(`captures: RPC "${name}" visait un projet hors démo. REFUSÉ.`);
  }
  const { data, error } = await world.admin.rpc(name, args);
  if (error) throw new Error(`captures: RPC ${name} — ${error.message}`);
  return data;
}

/**
 * Supprime le monde de démo. SEULE opération destructive du dossier, et elle
 * ne peut viser que des comptes dont l'email correspond au motif. Le reste
 * part en cascade (projects → issues → …) via les clés étrangères du schéma.
 */
export async function deleteDemoWorld(world, { confirmed } = {}) {
  if (confirmed !== true) {
    throw new Error("captures: suppression demandée sans confirmation explicite.");
  }
  for (const user of world.demoUsers) {
    if (!DEMO_EMAIL_PATTERN.test(user.email || "")) {
      throw new Error(
        `captures: refus de supprimer ${user.email} — l'email ne correspond pas au motif de démo.`,
      );
    }
  }
  const before = await measureBlastRadius(world);
  for (const user of world.demoUsers) {
    const { error } = await world.admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`captures: suppression de ${user.email} — ${error.message}`);
  }
  // On remesure avec les MÊMES ensembles d'ids qu'avant : les lignes de démo
  // ont disparu, donc le compte « hors démo » doit être rigoureusement
  // identique. Repartir d'un monde vide fausserait la comparaison.
  const after = await measureBlastRadius(world);
  const { lost } = diffBlastRadius(before, after);
  if (lost.length > 0) {
    throw new Error(
      `captures: ALERTE — la suppression a touché des lignes hors démo :\n  ${lost.join("\n  ")}`,
    );
  }
}

/**
 * Modifie les préférences d'un compte de DÉMO (`user_metadata`).
 *
 * Certaines vues ne se règlent pas par une table : la cadence et l'intensité
 * du cycle vivent dans les métadonnées du compte (`lib/cycle-prefs.ts`). La
 * fonction refuse tout compte hors famille de démo, et fusionne au lieu
 * d'écraser — les métadonnées existantes (nom affiché) sont préservées.
 */
export async function updateDemoUserMetadata(world, { userId, patch, confirmed } = {}) {
  if (confirmed !== true) {
    throw new Error("captures: modification de compte demandée sans confirmation explicite.");
  }
  if (!world.demoUserIds.has(userId)) {
    throw new Error(`captures: ${userId} n'est pas un compte de démo. REFUSÉ.`);
  }
  const { data: current, error: readError } = await world.admin.auth.admin.getUserById(userId);
  if (readError) throw new Error(`captures: lecture du compte — ${readError.message}`);
  if (!DEMO_EMAIL_PATTERN.test(current.user?.email || "")) {
    throw new Error(`captures: ${current.user?.email} ne correspond pas au motif de démo. REFUSÉ.`);
  }
  const { error } = await world.admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...current.user.user_metadata, ...patch },
  });
  if (error) throw new Error(`captures: écriture des préférences — ${error.message}`);
}

/**
 * Crée un compte de démo. Réservé au skill capture-world, et c'est le seul
 * endroit du dossier qui touche à `auth.users` — les scripts de seed n'ont
 * donc jamais besoin d'instancier un client Supabase eux-mêmes.
 *
 * Idempotent : si le compte existe déjà, il est renvoyé tel quel.
 */
export async function createDemoUser({ email = DEMO_EMAIL, fullName, password, confirmed } = {}) {
  if (confirmed !== true) {
    throw new Error("captures: création de compte demandée sans confirmation explicite.");
  }
  if (!DEMO_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `captures: "${email}" ne correspond pas au motif de démo. ` +
        `Les comptes de démo doivent s'appeler captures-demo@minddy.app ou captures-demo+xxx@minddy.app.`,
    );
  }

  const existing = await openDemoWorld({ allowMissing: true });
  const already = existing.demoUsers.find((u) => u.email === email);
  if (already) return { id: already.id, email, created: false };

  const { data, error } = await existing.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || "Démo captures" },
  });
  if (error) throw new Error(`captures: création du compte ${email} — ${error.message}`);

  return { id: data.user.id, email, created: true };
}
