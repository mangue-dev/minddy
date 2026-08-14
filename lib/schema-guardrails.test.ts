import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le garde-fou du schéma : ce qui a été durci une fois doit le rester.
 *
 * MIN-118 avait fermé quatre portes ; MIN-338 les a retrouvées ouvertes — pas
 * par malveillance, par ignorance. Chacune des migrations fautives (`pages` et
 * son DELETE, `ai_usage_run_spend` et son definer, les `*_select` des tables
 * d'agent sans clause TO) était juste, prise seule. La règle n'existait que
 * dans le commentaire d'un fichier que personne n'avait de raison d'ouvrir.
 *
 * Ce test la sort de là. Il ne relit PAS la base — il lit les migrations, là où
 * la faute s'écrit, et n'inspecte que les fichiers postérieurs au dernier balai
 * ({@link SWEEP}) : ce qui précède a été rattrapé par les BOUCLES de ce balai,
 * pas par le texte de son propre fichier, et le relire donnerait des fautes
 * déjà corrigées. L'état réel de la prod, lui, se contrôle avec
 * `node scripts/security-probe.mjs`, qui exerce les mêmes invariants contre
 * PostgREST avec la vraie clé anon et un vrai JWT.
 *
 * Quand ce test échoue, le correctif n'est presque jamais de modifier l'ancienne
 * migration (elle est déjà appliquée en prod) : c'est d'ajouter une migration
 * qui recopie les boucles de {@link SWEEP}, écrites pour être rejouées — et de
 * faire avancer {@link SWEEP} jusqu'à elle.
 */

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/** Le dernier balai — MIN-338. Tout fichier APRÈS lui est soumis aux règles. */
const SWEEP = "20261220090000";

/**
 * Les seules `security definer` que `authenticated` doit pouvoir exécuter :
 * celles qu'une expression de POLICY appelle. Même motif que dans
 * `20260926093000_definer_grants_sweep.sql` — une famille, pas une liste, parce
 * qu'une liste ne connaît pas les fonctions écrites après elle.
 */
const POLICY_HELPERS =
  /^(can_access_project|is_project_member|is_project_owner|can_watch_.*|.*_quota_ok)$/;

/** Les rôles qu'une policy a le droit de viser. `public` et `anon` : jamais. */
const ALLOWED_POLICY_ROLES = new Set(["authenticated", "service_role"]);

type Migration = { version: string; file: string; sql: string; statements: string[] };

/**
 * Découpe un fichier SQL en instructions, commentaires retirés.
 *
 * Le seul point délicat est le dollar-quoting : un corps `$$ … ; -- … $$`
 * contient des `;` et des `--` qui ne sont ni des fins d'instruction ni des
 * commentaires. On avance donc caractère par caractère plutôt qu'avec un
 * `split(";")`, et le corps est recopié tel quel — c'est lui qui porte les
 * boucles des balais, que les règles ci-dessous savent reconnaître.
 */
function statementsOf(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const tag = /^\$[A-Za-z_]*\$/.exec(rest);
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      const stop = end === -1 ? sql.length : end + tag[0].length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (rest.startsWith("'")) {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ";") {
      out.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean).map((s) => s.replace(/\s+/g, " "));
}

function parse(file: string, sql: string): Migration {
  return { version: file.split("_")[0], file, sql, statements: statementsOf(sql) };
}

const migrations: Migration[] = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => parse(file, readFileSync(join(MIGRATIONS, file), "utf8")));

/** Les fichiers soumis aux règles : ceux écrits après le dernier balai. */
const after = migrations.filter((m) => m.version > SWEEP);

/**
 * Les tables portant `project_id`, accumulées sur TOUTES les migrations — une
 * colonne peut arriver bien après la création de sa table.
 */
function projectScopedTables(all: Migration[], upTo: string): Set<string> {
  const tables = new Set<string>();
  for (const m of all) {
    if (m.version > upTo) break;
    for (const st of m.statements) {
      const create = /^create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/i.exec(st);
      if (create && /\bproject_id\b/i.test(st)) tables.add(create[1]);
      const alter = /^alter table (?:public\.)?(\w+)\b/i.exec(st);
      if (alter && /\badd column\b[\s\S]*\bproject_id\b/i.test(st)) tables.add(alter[1]);
    }
  }
  return tables;
}

// ── Les règles ───────────────────────────────────────────────────────────────
// Chacune rend la liste des fautes, `file : ce qui ne va pas`. Elles sont
// appliquées deux fois plus bas : aux vraies migrations, et à des fichiers
// synthétiques qui portent la faute — sans quoi, tant qu'aucune migration ne
// suit le balai, ce fichier passerait au vert sans rien avoir regardé.

/** Sans clause `TO`, une policy retombe sur le rôle `public` — donc `anon`. */
function policiesTargetARole(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      const policy = /^create policy (\w+) on (?:public\.)?(\w+)\b/i.exec(st);
      if (!policy) continue;
      const to = /\bto ([\w\s,]+?)\s+(?:using|with check)\b/i.exec(st);
      if (!to) {
        offenders.push(`${m.file} : ${policy[1]} n'a pas de clause TO`);
        continue;
      }
      for (const role of to[1].split(",").map((r) => r.trim().toLowerCase())) {
        if (!ALLOWED_POLICY_ROLES.has(role)) {
          offenders.push(`${m.file} : ${policy[1]} vise \`${role}\``);
        }
      }
    }
  }
  return offenders;
}

/** Une table sans RLS est lisible et écrivable par toute clé anon. */
function newTablesEnableRls(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      const create = /^create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/i.exec(st);
      if (!create) continue;
      const rls = new RegExp(
        `^alter table (?:public\\.)?${create[1]}\\b.*enable row level security`,
        "i"
      );
      if (!m.statements.some((s) => rls.test(s))) {
        offenders.push(`${m.file} : ${create[1]} sans \`enable row level security\``);
      }
    }
  }
  return offenders;
}

/**
 * Le bootstrap Supabase pose un `alter default privileges … grant all on
 * functions to anon, authenticated` : toute fonction créée dans `public` naît
 * exécutable par la clé anon publique. `revoke … from public` NE SUFFIT PAS —
 * c'est exactement la forme qui a laissé `get_ai_run_spend` ouverte.
 */
function definersAreClosed(files: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    for (const st of m.statements) {
      if (!/\bsecurity definer\b/i.test(st)) continue;
      const fn = /^create (?:or replace )?function (?:public\.)?(\w+)\s*\(/i.exec(st);
      if (!fn) continue;
      const name = fn[1];
      const bodyAt = st.search(/\$[A-Za-z_]*\$/);
      const header = bodyAt === -1 ? st : st.slice(0, bodyAt);
      if (!/\bset search_path\b/i.test(header)) {
        offenders.push(`${m.file} : ${name} n'a pas de \`set search_path\``);
      }
      // Une fonction trigger n'est pas appelable par PostgREST, et les aides de
      // policy DOIVENT rester exécutables par `authenticated` (les révoquer
      // fait LEVER la branche, ce qui fait tomber la policy entière).
      if (/returns trigger\b/i.test(header) || POLICY_HELPERS.test(name)) continue;
      const closed = m.statements.some(
        (s) =>
          (new RegExp(`^revoke .*\\bon function (?:public\\.)?${name}\\b`, "i").test(s) &&
            /\banon\b/i.test(s) &&
            /\bauthenticated\b/i.test(s)) ||
          // Ou le balai lui-même, recopié : il les ferme toutes d'un coup.
          (/^do /i.test(s) && /revoke all on function/i.test(s) && /prosecdef/i.test(s))
      );
      if (!closed) {
        offenders.push(
          `${m.file} : ${name} garde son EXECUTE pour anon/authenticated ` +
            `(revoke … from public, anon, authenticated — « from public » seul ne suffit pas)`
        );
      }
    }
  }
  return offenders;
}

/**
 * Un `with check` ne voit que la ligne NOUVELLE : il ne peut pas épingler
 * `project_id`. Ouvrir l'UPDATE d'une table cloisonnée sans rejouer le trigger
 * de gel, c'est laisser un membre déplacer la ligne dans son propre projet.
 */
function updatePoliciesFreezeProjectId(files: Migration[], all: Migration[]): string[] {
  const offenders: string[] = [];
  for (const m of files) {
    const scoped = projectScopedTables(all, m.version);
    for (const st of m.statements) {
      const policy = /^create policy (\w+) on (?:public\.)?(\w+) for (update|all)\b/i.exec(st);
      if (!policy || !scoped.has(policy[2])) continue;
      if (!/freeze_project_id/i.test(m.sql)) {
        offenders.push(
          `${m.file} : ${policy[1]} ouvre l'UPDATE de ${policy[2]} sans rejouer ` +
            `la boucle \`freeze_project_id\` de ${SWEEP}`
        );
      }
    }
  }
  return offenders;
}

// ── Le dépôt ─────────────────────────────────────────────────────────────────

describe("garde-fou du schéma", () => {
  it("aucune version de migration en double", () => {
    // Le piège récurrent : la version est la clé primaire du registre distant.
    // Deux fichiers qui la partagent, et le second reste « en attente » POUR
    // TOUJOURS, sauté en silence par `db push` (arrivé deux fois).
    const seen = new Map<string, string[]>();
    for (const m of migrations) seen.set(m.version, [...(seen.get(m.version) ?? []), m.file]);
    expect([...seen.values()].filter((files) => files.length > 1)).toEqual([]);
  });

  it("le balai de référence existe", () => {
    // Si la constante ne désigne plus rien, tout le reste passerait au vert en
    // n'inspectant aucun fichier.
    expect(migrations.some((m) => m.version === SWEEP)).toBe(true);
  });

  it("toute policy vise explicitement un rôle, jamais `public` ni `anon`", () => {
    expect(policiesTargetARole(after)).toEqual([]);
  });

  it("toute table créée active la RLS dans le même fichier", () => {
    expect(newTablesEnableRls(after)).toEqual([]);
  });

  it("toute `security definer` fige son search_path et se referme sur anon/authenticated", () => {
    expect(definersAreClosed(after)).toEqual([]);
  });

  it("toute policy UPDATE sur une table à `project_id` vient avec le gel", () => {
    expect(updatePoliciesFreezeProjectId(after, migrations)).toEqual([]);
  });
});

// ── Les règles elles-mêmes ───────────────────────────────────────────────────
// Les quatre fautes de MIN-338, réécrites telles qu'elles ont été commises, et
// leur forme correcte à côté. C'est ce bloc qui prouve que le bloc précédent
// regarde quelque chose.

const later = (sql: string) => [parse("29990101000000_probe.sql", sql)];

describe("garde-fou du schéma — les fautes qu'il attrape", () => {
  it("attrape une policy sans clause TO, et laisse passer `to authenticated`", () => {
    // Telle qu'écrite dans 20261126090000 et suivantes.
    expect(
      policiesTargetARole(
        later("create policy agent_runs_select on public.agent_runs for select using (true);")
      )
    ).toHaveLength(1);
    expect(policiesTargetARole(later("create policy p on public.t for select to anon using (true);")))
      .toHaveLength(1);
    expect(
      policiesTargetARole(
        later("create policy p on public.t for select to authenticated using (true);")
      )
    ).toEqual([]);
  });

  it("attrape une table créée sans RLS", () => {
    expect(newTablesEnableRls(later("create table public.t (id uuid primary key);"))).toHaveLength(1);
    expect(
      newTablesEnableRls(
        later(
          "create table if not exists public.t (id uuid primary key);\n" +
            "alter table public.t enable row level security;"
        )
      )
    ).toEqual([]);
  });

  it("attrape un definer qui ne révoque que `from public`", () => {
    // La forme exacte de get_ai_run_spend (20261118090000).
    const leaky =
      "create function public.get_ai_run_spend(p uuid) returns numeric language sql " +
      "security definer set search_path = public as $$ select 1 $$;\n" +
      "revoke all on function public.get_ai_run_spend(uuid) from public;";
    expect(definersAreClosed(later(leaky))).toHaveLength(1);

    const closed = leaky.replace("from public;", "from public, anon, authenticated;");
    expect(definersAreClosed(later(closed))).toEqual([]);
  });

  it("attrape un definer dont le search_path flotte", () => {
    const floating =
      "create function public.f() returns numeric language sql security definer as $$ select 1 $$;\n" +
      "revoke all on function public.f() from public, anon, authenticated;";
    expect(definersAreClosed(later(floating))).toHaveLength(1);
  });

  it("laisse passer une fonction trigger et une aide de policy", () => {
    expect(
      definersAreClosed(
        later(
          "create function public.notify() returns trigger language plpgsql security definer " +
            "set search_path = public as $$ begin return new; end $$;"
        )
      )
    ).toEqual([]);
    expect(
      definersAreClosed(
        later(
          "create function public.can_watch_thing(t text) returns boolean language sql " +
            "security definer set search_path = public as $$ select true $$;"
        )
      )
    ).toEqual([]);
  });

  it("attrape une policy UPDATE ouverte sans le gel de `project_id`", () => {
    const naked = later("create policy issues_update on public.issues for update to authenticated " +
      "using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));");
    expect(updatePoliciesFreezeProjectId(naked, [...migrations, ...naked])).toHaveLength(1);

    const withFreeze = later(
      "create policy issues_update on public.issues for update to authenticated " +
        "using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));\n" +
        "create trigger issues_freeze_project_id before update of project_id on public.issues " +
        "for each row execute function public.freeze_project_id();"
    );
    expect(updatePoliciesFreezeProjectId(withFreeze, [...migrations, ...withFreeze])).toEqual([]);
  });

  it("découpe un corps dollar-quoté sans se faire couper par ses `;`", () => {
    const st = statementsOf(
      "create function public.f() returns void language plpgsql as $$ begin -- ; pas un commentaire\n" +
        " perform 1; perform 2; end $$;\nselect 1;"
    );
    expect(st).toHaveLength(2);
    expect(st[1]).toBe("select 1");
  });
});
