/**
 * minddy — MIN-118 : sonde anti cross-tenant.
 *
 * Vérifie, EN VRAI contre la base de prod via PostgREST + Storage, que la
 * seconde ligne de défense (RLS + grants) tient quand l'attaquant détient la
 * clé anon publique et un JWT valide — ce que possède tout utilisateur connecté.
 *
 * Chaque contrôle correspond à un trou fermé par les migrations 20260926* :
 *   - lecture d'un ticket d'un projet étranger refusée (RLS existant, contrôle témoin) ;
 *   - écriture d'un ticket dans un projet étranger refusée ;
 *   - RPC `reconcile_objective_status` refusé pour anon ET authenticated (§2) ;
 *   - `select=access_token_encrypted` sur git_connections refusé (§2), colonne
 *     autorisée toujours lisible (témoin positif — on n'a pas cassé les lectures légitimes) ;
 *   - upload storage hors de son préfixe autorisé refusé ;
 *   - listing du bucket `project-icons` refusé pour anon (§4).
 *
 * ⚠ Touche la PROD (le .env local pointe la prod). Décor jeté en clé service,
 * cleanup complet en `finally`. Exécution MANUELLE seulement — hors du
 * `include` de vitest.config.ts.
 *
 *   node scripts/security-probe.mjs
 *
 * À lancer APRÈS `supabase db push` : avant les migrations, plusieurs contrôles
 * échouent (c'est le sens du chantier).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Charge .env sans dépendance (les scripts tournent hors du runtime Next). */
function env(name) {
  if (!process.env[name]) {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
/** Un contrôle : `refused` doit être vrai pour passer. */
function check(name, refused, detail = "") {
  const ok = Boolean(refused);
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗ ÉCHEC"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Appel REST/Storage brut avec un porteur donné (JWT user ou clé anon). */
async function rest(path, { method = "GET", bearer, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${bearer ?? ANON_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* corps vide (204) ou non-JSON */
  }
  return { status: res.status, ok: res.ok, payload };
}

const stamp = Date.now();
const created = { users: [] };

async function makeUser(tag) {
  const email = `probe-${tag}-${stamp}@minddy-probe.invalid`;
  const password = `Pw-${stamp}-${tag}-xY!`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${tag}) : ${error.message}`);
  created.users.push(data.user.id);
  // Connexion réelle → vrai JWT aal1 (aucun facteur enrôlé), exactement ce que
  // PostgREST voit d'un utilisateur normal (la gate MFA vit dans l'app, pas ici).
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) throw new Error(`signIn(${tag}) : ${signErr.message}`);
  return { id: data.user.id, jwt: session.session.access_token };
}

async function main() {
  console.log(`→ Sonde sécurité contre ${SUPABASE_URL}\n`);

  const alice = await makeUser("a");
  const bob = await makeUser("b");

  // Décor : un projet + un ticket + un objectif appartenant à Alice.
  const { data: project, error: projErr } = await service
    .from("projects")
    .insert({ owner_id: alice.id, name: "Probe A", key: "PRBA" })
    .select("id")
    .single();
  if (projErr) throw new Error(`projet Alice : ${projErr.message}`);
  created.projectId = project.id;

  // `name`, pas `title` : la colonne s'appelle `name` (20260704170000), et la
  // table n'a pas de `created_by` — l'insert échouait avant le premier contrôle.
  const { data: objective, error: objErr } = await service
    .from("objectives")
    .insert({ project_id: project.id, name: "Probe obj" })
    .select("id, status")
    .single();
  if (objErr) throw new Error(`objectif Alice : ${objErr.message}`);
  created.objectiveId = objective.id;

  const { data: issue, error: issueErr } = await service
    .from("issues")
    .insert({
      project_id: project.id,
      number: 1,
      title: "Probe issue",
      created_by: alice.id,
    })
    .select("id")
    .single();
  if (issueErr) throw new Error(`ticket Alice : ${issueErr.message}`);
  created.issueId = issue.id;

  // 1. Bob lit les tickets du projet d'Alice → RLS doit renvoyer 0 ligne.
  const readOther = await rest(
    `/rest/v1/issues?project_id=eq.${project.id}&select=id`,
    { bearer: bob.jwt },
  );
  check(
    "lecture cross-tenant d'un ticket refusée (0 ligne)",
    Array.isArray(readOther.payload) && readOther.payload.length === 0,
    `status ${readOther.status}, ${Array.isArray(readOther.payload) ? readOther.payload.length : "?"} ligne(s)`,
  );

  // 2. Bob crée un ticket dans le projet d'Alice → with check RLS doit refuser.
  const writeOther = await rest(`/rest/v1/issues`, {
    method: "POST",
    bearer: bob.jwt,
    body: { project_id: project.id, number: 999, title: "pirate", created_by: bob.id },
    headers: { Prefer: "return=representation" },
  });
  check(
    "écriture cross-tenant d'un ticket refusée",
    !writeOther.ok,
    `status ${writeOther.status}`,
  );

  // 3. RPC SECURITY DEFINER refusé pour authenticated ET anon (§2).
  const rpcAuthed = await rest(`/rest/v1/rpc/reconcile_objective_status`, {
    method: "POST",
    bearer: bob.jwt,
    body: { obj_id: objective.id },
  });
  check(
    "rpc reconcile_objective_status refusé (authenticated)",
    !rpcAuthed.ok,
    `status ${rpcAuthed.status}`,
  );
  const rpcAnon = await rest(`/rest/v1/rpc/reconcile_objective_status`, {
    method: "POST",
    body: { obj_id: objective.id },
  });
  check(
    "rpc reconcile_objective_status refusé (anon)",
    !rpcAnon.ok,
    `status ${rpcAnon.status}`,
  );

  // 3 bis. Les AUTRES fonctions SECURITY DEFINER, réservées au service_role.
  // Elles ne révoquaient que « from public », ce qui laissait intacts les
  // EXECUTE explicites d'`anon`/`authenticated` posés par le bootstrap Supabase :
  // sans session du tout, la clé anon lisait la liste des comptes avec leurs
  // emails, les coûts IA, l'usage de n'importe quel user_id, et pouvait réserver
  // le run d'un autre. Fermé par 20260926093000 — vérifié ici pour anon ET
  // authenticated (le pire cas est anon : aucun compte requis).
  const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
  const DEFINER_RPCS = [
    ["get_admin_users_overview", { p_search: null, p_limit: 1, p_offset: 0 }],
    ["get_admin_user_totals", { p_tz: "UTC" }],
    ["get_ai_usage_stats", {}],
    ["get_ai_cost_daily", { p_days: 1, p_tz: "UTC" }],
    ["get_ai_run_calls", { p_run_id: ZERO_UUID }],
    ["get_agent_quota_usage", { p_month_start: "2026-01-01T00:00:00Z" }],
    ["get_user_usage_since", { p_user_id: ZERO_UUID, p_since: "2026-01-01T00:00:00Z" }],
    ["get_user_usage_history", { p_user_id: ZERO_UUID, p_since: "2026-01-01T00:00:00Z" }],
    ["claim_agent_run", { p_run_id: ZERO_UUID }],
    ["next_issue_number", { p_project_id: ZERO_UUID }],
  ];
  for (const [fn, payload] of DEFINER_RPCS) {
    for (const [who, bearer] of [
      ["anon", undefined],
      ["authenticated", bob.jwt],
    ]) {
      const res = await rest(`/rest/v1/rpc/${fn}`, {
        method: "POST",
        bearer,
        body: payload,
      });
      // 401/403 = privilège refusé (ce qu'on veut). Un 404 PGRST202 voudrait
      // dire que la signature a bougé : le contrôle ne prouverait plus rien.
      check(
        `rpc ${fn} refusé (${who})`,
        res.status === 401 || res.status === 403,
        `status ${res.status}${res.status === 404 ? " — SIGNATURE À METTRE À JOUR" : ""}`,
      );
    }
  }

  // 4. Colonne secrète refusée, colonne autorisée toujours lisible (§2).
  const secretCol = await rest(
    `/rest/v1/git_connections?select=access_token_encrypted`,
    { bearer: alice.jwt },
  );
  check(
    "select colonne secrète git_connections refusé",
    !secretCol.ok,
    `status ${secretCol.status}`,
  );
  const allowedCol = await rest(
    `/rest/v1/git_connections?select=id,provider`,
    { bearer: alice.jwt },
  );
  check(
    "select colonne autorisée git_connections OK (témoin positif)",
    allowedCol.ok,
    `status ${allowedCol.status}`,
  );

  // 5. Upload storage hors préfixe autorisé (projet d'Alice) refusé pour Bob.
  const uploadOther = await fetch(
    `${SUPABASE_URL}/storage/v1/object/attachments/projects/${project.id}/${stamp}/pirate.txt`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${bob.jwt}`,
        "Content-Type": "text/plain",
      },
      body: "pirate",
    },
  );
  check(
    "upload storage hors préfixe refusé",
    !uploadOther.ok,
    `status ${uploadOther.status}`,
  );

  // 6. Listing du bucket project-icons refusé pour anon (§4).
  const listIcons = await fetch(`${SUPABASE_URL}/storage/v1/object/list/project-icons`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "", limit: 100 }),
  });
  let iconRows = null;
  try {
    iconRows = await listIcons.json();
  } catch {
    /* vide */
  }
  // Refus = status d'erreur OU liste vide (la policy de listing supprimée).
  check(
    "listing bucket project-icons refusé pour anon",
    !listIcons.ok || (Array.isArray(iconRows) && iconRows.length === 0),
    `status ${listIcons.status}, ${Array.isArray(iconRows) ? iconRows.length : "?"} entrée(s)`,
  );

  console.log(
    `\n${failures === 0 ? "✅ TOUT VERT" : `❌ ${failures} contrôle(s) en échec`}`,
  );
}

main()
  .catch((err) => {
    console.error("\n💥 Erreur d'exécution :", err.message);
    failures += 1;
  })
  .finally(async () => {
    // Cleanup : supprimer les users cascade projects/issues/objectives (FK
    // owner_id/created_by on delete cascade). Le décor entier part avec eux.
    for (const id of created.users) {
      await service.auth.admin.deleteUser(id).catch(() => {});
    }
    console.log("→ décor supprimé");
    process.exit(failures === 0 ? 0 : 1);
  });
