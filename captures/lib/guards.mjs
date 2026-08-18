/**
 * captures/ — security layer between the seed scripts and the PROD database.
 *
 * THE INVARIANT, and it fits in one sentence: no writing can reach
 * a line that does not belong to the demo world. It’s not “we don’t write
 * only INSERTs” — correcting a title or removing a demo ticket is
 * perfectly legitimate. What is forbidden is to touch the rest.
 *
 * Absolute rule: NO seed script speaks directly to Supabase.
 * Everything goes through this module, which applies the following safeguards:
 *
 * 1. Whitelisted tables (captures/lib/config.mjs).
 * 2. Each inserted line must be attached to the demo world, by a
 * owner, a project, or a parent line itself proven to be
 * demo. A line that points elsewhere is REJECTED before the network.
 * 3. Any modification or withdrawal rereads the lines concerned and verifies
 * that they are ours BEFORE we act. We never trust
 *      au filtre.
 * 4. No TRUNCATE, no arbitrary SQL, no reset. No exceptions.
 * 5. Measuring the blast radius: if lines outside the demo DISAPPEAR,
 * we scream. An increase is just competing activity, we ignore it.
 *   6. Rien ne part sans confirmation explicite.
 *
 * We NEVER call the app's HTTP API to create data. To write
 * in base directly short-circuits the routes, and therefore the Smart Assign,
 * notifications, PostHog events, Resend emails and billing.
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

/** Customer service-role. Bypasses RLS — hence all the guardrails above. */
function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── Perimeter consistency, checked upon loading ───────────────────────────
// A table without anchors would let any line through. A parent
// declared after his child would not yet be resolved at the time of validation.
// Both are configuration errors, not borderline cases: we refuse
// to start rather than writing with a hole in the guardrail.
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

/** Tables serving as parent to at least one other: their ids must be resolved. */
const PARENT_TABLES = new Set(
  Object.values(TABLE_SCOPES).flatMap((spec) => (spec.parents || []).map((p) => p.table)),
);
PARENT_TABLES.add("projects"); // ancrage de `projectColumn`

/**
 * Lists demo family accounts.
 *
 * Resolution goes through the Supabase Auth admin API, NOT through a table
 * mirror: `public.profiles` was removed (migration 20260706130000) and
 * minddy now reads identities directly from `auth.users` — even
 * source of truth that `lib/server/auth-users.ts` app side.
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
 * Applies table anchor filters to a query. Returns `null` if
 * an anchor is empty — in which case there are NO demo lines for that
 * table, and you should definitely not run a query without a filter.
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
 * Opens the demo world: resolves the account, its projects, and returns a
 * handle that the seed scripts use. Fails if account does not exist
 * (it is `capture-world` who creates it, deliberately and only once).
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
    /** Demo row identifiers, per table. Serves as an anchor for children. */
    demoIds: {},
    demoProjects: [],

    /** Re-resolves the demo family, its projects, and all anchor ids. */
    async refresh() {
      const fresh = await listDemoAccounts(admin);
      this.demoUsers = fresh;
      this.demoUserIds = new Set(fresh.map((u) => u.id));
      this.demoIds = {};

      // Order of declaration = order of dependency: when we resolve a table,
      // his parents' IDs are already known.
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

  // Bootstrapping: `projects` anchors itself to the accounts, everything else follows from there.
  world.demoIds.projects = new Set();
  await world.refresh();
  return world;
}

/**
 * Verifies that a line can only touch the demo perimeter.
 *
 * All declared anchors must pass. An unknown relative of the world of
 * demo — because it doesn't exist, or because it belongs to someone
 * else — fails validation before any network access.
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
 * Counts, for each writable table, the lines located OUTSIDE the perimeter
 * demo. This vector must be strictly identical before and after a
 * seed. Any discrepancy means that we have touched data that is not ours.
 *
 * Measured by difference (total − demo) rather than by a NOT IN: two
 * header counts, no list of identifiers to pass through, and the
 * result remains correct regardless of the number of demo lines.
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
 * Compare two measurements. Only a DECLINE is alarming.
 *
 * An increase in the “non-demo” account cannot come from us: our writings
 * are validated as belonging to the demo scope, therefore they feed
 * the “inside” account. An increase simply means that a real user
 * (or you, in another tab) created something during the run. Do
 * failing on this would produce false alarms constantly.
 *
 * A drop, on the other hand, means that lines that are not ours have
 * disappeared. That never happens normally.
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
 * Reads the targeted lines and checks that they ALL belong to the world of
 * demo. This is what makes a targeted edit or deletion safe:
 * we never trust the filter, we look at the real lines before
 * de toucher quoi que ce soit.
 */
async function readOwnedRows(world, table, match) {
  const { data, error } = await world.admin.from(table).select("*").match(match);
  if (error) throw new Error(`captures: lecture de ${table} — ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      `captures: aucune ligne ne correspond dans ${table} (${JSON.stringify(match)}). ` +
        "Rien à faire — vérifie l'environnement de démonstration.",
    );
  }
  data.forEach((row, i) => validateRow(world, table, row, i));
  return data;
}

/**
 * A modification plan. We build it, we DESCRIBE it to the user by
 * French, we wait for his agreement, and only then we apply it.
 *
 * The invariant of the file is not “we only write INSERTs”, it is
 * “no writing can reach a line that does not belong to the world
 * demo”. Correcting a title or removing three demo tickets is therefore
 * permitted, and checked line by line before execution.
 */
export function createPlan(world) {
  const steps = [];

  return {
    /** Add lines. Nothing goes on the network here. */
    insert(table, rows, label) {
      assertWritable(table);
      const list = Array.isArray(rows) ? rows : [rows];
      steps.push({ kind: "insert", table, rows: list, label: label || table });
      return this;
    },

    /**
     * Edits existing demo lines.
     *   plan.update("issues", { id }, { status: "in_review" }, "passage en revue")
     */
    update(table, match, patch, label) {
      assertWritable(table);
      steps.push({ kind: "update", table, match, patch, label: label || table });
      return this;
    },

    /**
     * Removes existing demo lines.
     *   plan.remove("issues", { id }, "ticket en trop")
     */
    remove(table, match, label) {
      assertWritable(table);
      steps.push({ kind: "remove", table, match, label: label || table });
      return this;
    },

    /** Summary in French, intended for the user. No technical jargon. */
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

    /** Validate the ENTIRE plan before writing anything, then follow through. */
    async apply({ confirmed } = {}) {
      if (confirmed !== true) {
        throw new Error(
          "captures: apply() appelé sans confirmation explicite. " +
            "L'utilisateur doit valider le plan avant toute écriture.",
        );
      }

      // Full validation BEFORE the first write.
      for (const step of steps) {
        if (step.kind === "insert") {
          step.rows.forEach((row, i) => validateRow(world, step.table, row, i));
        } else {
          step.targets = await readOwnedRows(world, step.table, step.match);
          if (step.kind === "update") {
            // A modification must never take the line outside the perimeter.
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

/** Calls a whitelisted RPC, checking its target. */
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
 * Deletes the demo world. ONLY destructive operation of the file, and it
 * can only target accounts whose email matches the reason. The rest
 * cascades (projects → issues → …) via the foreign keys of the schema.
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
  // We measure again with the SAME sets of ids as before: the demo lines
  // have disappeared, so the “non-demo” account must be rigorously
  // identical. Starting from an empty world would distort the comparison.
  const after = await measureBlastRadius(world);
  const { lost } = diffBlastRadius(before, after);
  if (lost.length > 0) {
    throw new Error(
      `captures: ALERTE — la suppression a touché des lignes hors démo :\n  ${lost.join("\n  ")}`,
    );
  }
}

/**
 * Changes the preferences of a DEMO account (`user_metadata`).
 *
 * Some views cannot be regulated by a table: cadence and intensity
 * of the cycle live in the account metadata (`lib/cycle-prefs.ts`). There
 * function refuses any account outside the demo family, and instead merges
 * overwrite — existing metadata (displayed name) is preserved.
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
 * Create a demo account. Reserved for the capture-world skill, and it is the only one
 * location in the folder that touches `auth.users` — the seed scripts do not have
 * so never need to instantiate a Supabase client themselves.
 *
 * Idempotent: If the account already exists, it is returned as is.
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
