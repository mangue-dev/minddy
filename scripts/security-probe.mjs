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
 *   - listing du bucket `project-icons` refusé pour anon (§4) ;
 *   - redirection d'une invitation vers le projet d'un autre refusée (MIN-325,
 *     migration 20261215090000) ;
 *   - cloisonnement en base (MIN-338, migration 20261220090000) : déplacement
 *     d'un ticket ou d'un objectif vers son propre projet refusé, hard delete
 *     d'une page refusé, `get_ai_run_spend` refusé pour anon ET authenticated,
 *     tables dont la policy était revenue sans clause `TO` illisibles pour anon.
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

  // 7. MIN-325 : une invitation ne se redirige pas vers le projet d'un autre.
  // Bob crée un projet à lui, s'y invite lui-même (les deux gestes lui sont
  // permis, il en est owner), puis tente de déplacer la ligne vers le projet
  // d'Alice. C'était le trou : `project_invitations_update_invitee` ne
  // contraignait que `invited_user_id`, donc l'UPDATE passait, et accepter
  // l'invitation inscrivait Bob chez Alice. Les deux portes doivent refuser —
  // celle de l'invité (policy supprimée) comme celle de l'owner (son
  // `with check` exige d'être owner du NOUVEAU project_id).
  const { data: bobProject, error: bobProjErr } = await service
    .from("projects")
    .insert({ owner_id: bob.id, name: "Probe B", key: "PRBB" })
    .select("id")
    .single();
  if (bobProjErr) throw new Error(`projet Bob : ${bobProjErr.message}`);

  const { data: selfInvite, error: inviteErr } = await service
    .from("project_invitations")
    .insert({
      project_id: bobProject.id,
      invited_email: `probe-b-${stamp}@minddy-probe.invalid`,
      invited_user_id: bob.id,
      invited_by: bob.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (inviteErr) throw new Error(`invitation Bob : ${inviteErr.message}`);

  const hijack = await rest(`/rest/v1/project_invitations?id=eq.${selfInvite.id}`, {
    method: "PATCH",
    bearer: bob.jwt,
    body: { project_id: project.id },
    headers: { Prefer: "return=representation" },
  });
  // Refus = status d'erreur OU zéro ligne modifiée (plus aucune policy UPDATE
  // ne s'applique à l'invité : la ligne est invisible à l'écriture).
  check(
    "redirection d'une invitation vers un projet étranger refusée",
    !hijack.ok || (Array.isArray(hijack.payload) && hijack.payload.length === 0),
    `status ${hijack.status}, ${Array.isArray(hijack.payload) ? hijack.payload.length : "?"} ligne(s)`,
  );

  // Témoin : la ligne n'a pas bougé en base (une policy permissive rendrait le
  // contrôle ci-dessus vert si PostgREST cachait la représentation).
  const { data: afterHijack } = await service
    .from("project_invitations")
    .select("project_id")
    .eq("id", selfInvite.id)
    .single();
  check(
    "l'invitation pointe toujours son projet d'origine (témoin)",
    afterHijack?.project_id === bobProject.id,
    `project_id ${afterHijack?.project_id}`,
  );

  // 8. MIN-332 : une conversation avec Numo appartient à qui l'a eue.
  //
  // Bob devient MEMBRE du projet d'Alice — c'est tout le sujet : l'attaque n'est
  // pas cross-tenant, elle est intra-projet. Alice ouvre une conversation sur un
  // ticket que Bob voit, avec sa consigne, un événement et un message de
  // steering. Bob ne doit rien en lire, sur AUCUNE des trois tables — la
  // troisième, `agent_run_messages`, n'a jamais porté la restriction.
  const { error: memberErr } = await service
    .from("project_members")
    .insert({ project_id: project.id, user_id: bob.id, role: "member" });
  if (memberErr) throw new Error(`Bob membre : ${memberErr.message}`);

  const { data: aliceRun, error: runErr } = await service
    .from("agent_runs")
    .insert({
      project_id: project.id,
      issue_id: issue.id,
      created_by: alice.id,
      status: "completed",
      prompt: "secret d'Alice",
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`run Alice : ${runErr.message}`);

  const { error: evErr } = await service
    .from("agent_run_events")
    .insert({ run_id: aliceRun.id, seq: 0, type: "thinking", payload: {} });
  if (evErr) throw new Error(`event Alice : ${evErr.message}`);
  const { error: msgErr } = await service
    .from("agent_run_messages")
    .insert({ run_id: aliceRun.id, content: "steering d'Alice", created_by: alice.id });
  if (msgErr) throw new Error(`message Alice : ${msgErr.message}`);

  for (const [table, label] of [
    ["agent_runs", "le run"],
    ["agent_run_events", "ses événements"],
    ["agent_run_messages", "ses messages"],
  ]) {
    const column = table === "agent_runs" ? "id" : "run_id";
    const res = await rest(
      `/rest/v1/${table}?${column}=eq.${aliceRun.id}&select=id`,
      { bearer: bob.jwt },
    );
    check(
      `conversation d'un coéquipier : ${label} illisible (0 ligne)`,
      Array.isArray(res.payload) && res.payload.length === 0,
      `status ${res.status}, ${Array.isArray(res.payload) ? res.payload.length : "?"} ligne(s)`,
    );
  }

  // Témoin positif : la policy n'est pas simplement « tout refuser ». Un PASSAGE
  // DE ROUTINE est un geste du PROJET — Bob doit le voir, bien qu'Alice en soit
  // le `created_by` technique.
  const { data: routine, error: routineErr } = await service
    .from("agent_routines")
    .insert({
      project_id: project.id,
      owner_id: alice.id,
      title: "Probe routine",
      prompt: "balayage",
      frequency: "daily",
    })
    .select("id")
    .single();
  if (routineErr) throw new Error(`routine Alice : ${routineErr.message}`);

  const { data: routineRun, error: routineRunErr } = await service
    .from("agent_runs")
    .insert({
      project_id: project.id,
      issue_id: null,
      routine_id: routine.id,
      created_by: alice.id,
      status: "completed",
      triggered_by: "routine",
    })
    .select("id")
    .single();
  if (routineRunErr) throw new Error(`run de routine : ${routineRunErr.message}`);

  const routineRead = await rest(
    `/rest/v1/agent_runs?id=eq.${routineRun.id}&select=id`,
    { bearer: bob.jwt },
  );
  check(
    "passage de routine lisible par un membre (témoin positif)",
    Array.isArray(routineRead.payload) && routineRead.payload.length === 1,
    `status ${routineRead.status}, ${Array.isArray(routineRead.payload) ? routineRead.payload.length : "?"} ligne(s)`,
  );

  // 9. MIN-338 : le cloisonnement en base.
  //
  // Bob est membre du projet d'Alice (§8) ET owner du sien : il a donc accès
  // aux DEUX côtés. C'est ce qui rend le déplacement invisible à la RLS — un
  // `with check` ne voit que la ligne nouvelle, et la destination lui est
  // légitimement accessible. Seul le trigger de gel peut refuser.
  for (const [table, id, label, subject] of [
    ["issues", created.issueId, "d'un ticket", "le ticket"],
    ["objectives", created.objectiveId, "d'un objectif", "l'objectif"],
  ]) {
    const move = await rest(`/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      bearer: bob.jwt,
      body: { project_id: bobProject.id },
      headers: { Prefer: "return=representation" },
    });
    check(
      `déplacement ${label} vers son propre projet refusé`,
      !move.ok,
      `status ${move.status}`,
    );
    const { data: still } = await service
      .from(table)
      .select("project_id")
      .eq("id", id)
      .single();
    check(
      `${subject} est resté dans son projet (témoin)`,
      still?.project_id === project.id,
      `project_id ${still?.project_id}`,
    );
  }

  // Une page se supprime par la corbeille (clé service), pas par un DELETE
  // PostgREST : `pages_delete` emportait l'historique et laissait les fichiers
  // du bucket orphelins.
  const { data: page, error: pageErr } = await service
    .from("pages")
    .insert({
      project_id: project.id,
      title: "Probe page",
      content: { type: "doc", content: [] },
      position: "a0",
      created_by: alice.id,
      updated_by: alice.id,
    })
    .select("id")
    .single();
  if (pageErr) throw new Error(`page Alice : ${pageErr.message}`);

  const dropPage = await rest(`/rest/v1/pages?id=eq.${page.id}`, {
    method: "DELETE",
    bearer: bob.jwt,
    headers: { Prefer: "return=representation" },
  });
  check(
    "hard delete d'une page refusé",
    !dropPage.ok || (Array.isArray(dropPage.payload) && dropPage.payload.length === 0),
    `status ${dropPage.status}`,
  );
  const { data: pageStill } = await service
    .from("pages")
    .select("id")
    .eq("id", page.id)
    .maybeSingle();
  check("la page est toujours là (témoin)", Boolean(pageStill), pageStill ? "" : "DISPARUE");

  // `get_ai_run_spend` ne révoquait que « from public » — la forme précise que
  // le balai de MIN-118 avait identifiée comme insuffisante.
  for (const [who, bearer] of [
    ["anon", undefined],
    ["authenticated", bob.jwt],
  ]) {
    const res = await rest(`/rest/v1/rpc/get_ai_run_spend`, {
      method: "POST",
      bearer,
      body: { p_run_id: aliceRun.id },
    });
    check(
      `rpc get_ai_run_spend refusé (${who})`,
      res.status === 401 || res.status === 403,
      `status ${res.status}${res.status === 404 ? " — SIGNATURE À METTRE À JOUR" : ""}`,
    );
  }

  // Les policies revenues sans clause `TO` retombaient sur le rôle `public`,
  // donc sur `anon` : la clé publique du navigateur, sans aucune session.
  for (const table of [
    "agent_runs",
    "agent_run_events",
    "agent_run_messages",
    "issue_events",
    "page_files",
    "saved_views",
  ]) {
    const res = await rest(`/rest/v1/${table}?select=id&limit=1`);
    check(
      `${table} illisible sans session (anon)`,
      !res.ok || (Array.isArray(res.payload) && res.payload.length === 0),
      `status ${res.status}, ${Array.isArray(res.payload) ? res.payload.length : "?"} ligne(s)`,
    );
  }

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
