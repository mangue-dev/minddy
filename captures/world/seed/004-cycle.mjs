/**
 * 004 — la quinzaine de Camille.
 *
 * Pour quelle capture : `featureCycle` — « la quinzaine en cours : issues de
 * plusieurs projets dans une même liste, progression visible ».
 *
 * Trois contraintes du schéma dictent tout ce script :
 *
 *  1. Le cycle affiché est celui qui contient la date du jour CÔTÉ SERVEUR
 *     (`reconcileCycles`). L'horloge figée des captures ne vaut que pour le
 *     navigateur : semer d'autres dates ferait apparaître un cycle vide,
 *     fraîchement créé par l'application à côté du nôtre.
 *  2. La fenêtre n'est pas libre : elle se déduit de la cadence du compte,
 *     ancrée sur le lundi 1970-01-05. On écrit donc la cadence dans les
 *     préférences du compte, puis on calcule la fenêtre avec le même algorithme.
 *  3. Un ticket dans un cycle est TOUJOURS assigné au propriétaire du cycle
 *     (trigger `issues_enforce_cycle`) : sinon la base remet `cycle_id` à null
 *     sans rien dire. Seuls les tickets de Camille peuvent donc y entrer.
 *
 * Conséquence : cette donnée PÉRIME quand la quinzaine bascule. Relancer 003
 * puis 004 la réaligne sur la fenêtre courante.
 *
 * Idempotent : le cycle est réutilisé s'il couvre déjà la date du jour.
 *
 *   node captures/world/seed/004-cycle.mjs --dry-run
 *   node captures/world/seed/004-cycle.mjs
 */
import { openDemoWorld, createPlan, updateDemoUserMetadata } from "../../lib/guards.mjs";
import { EFFORT_POINTS } from "../../lib/config.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, DEMO_CADENCE } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Préférences de cycle du compte de démo, écrites dans `user_metadata` (clés
 * de lib/cycle-prefs.ts). `light` = 40 points par semaine : avec une quinzaine,
 * l'objectif tombe à 80, ce qui place l'anneau de capacité autour de la moitié
 * plutôt qu'au ras du sol.
 */
const CYCLE_PREFS = {
  // Les cycles sont OPT-IN : sans ce drapeau, la ligne existe en base mais
  // l'application affiche « Activer les cycles » et l'écran reste vide.
  cycles_enabled: true,
  cycle_duration_weeks: DEMO_CADENCE.durationWeeks,
  cycle_start_dow: DEMO_CADENCE.startDow,
  cycle_intensity: "light",
};

const INTENSITY_BASE_POINTS = { light: 40, medium: 80, heavy: 120 };

/**
 * Les tickets de la quinzaine, désignés par leur identifiant affiché. Tous
 * sont des tickets de Camille — c'est la condition pour qu'ils y restent.
 * Le mélange AUR + BCN est le sujet même de la capture.
 */
const CYCLE_ISSUES = [
  "AUR-1", "AUR-2", "AUR-9",
  "BCN-1", "BCN-2", "BCN-3", "BCN-4", "BCN-5", "BCN-6", "BCN-7", "BCN-8", "BCN-9",
];

/** Résout « AUR-2 » en la ligne de ticket correspondante. */
async function resolveIssues(world, identifiers) {
  const byKey = new Map(world.demoProjects.map((p) => [p.key, p]));
  const wanted = identifiers.map((id) => {
    const [key, number] = id.split("-");
    const project = byKey.get(key);
    if (!project) throw new Error(`captures: projet ${key} introuvable (ticket ${id}).`);
    return { id, projectId: project.id, number: Number(number) };
  });

  const { data, error } = await world.admin
    .from("issues")
    .select("id, number, title, status, effort, assignee_id, project_id, cycle_id")
    .in("project_id", [...new Set(wanted.map((w) => w.projectId))]);
  if (error) throw new Error(`captures: lecture des tickets — ${error.message}`);

  return wanted.map((w) => {
    const row = (data || []).find((i) => i.project_id === w.projectId && i.number === w.number);
    if (!row) throw new Error(`captures: le ticket ${w.id} n'existe pas. Lance 002 et 003 d'abord.`);
    return { ...row, identifier: w.id };
  });
}

async function main() {
  const window = currentCycleWindow();
  const targetPoints =
    INTENSITY_BASE_POINTS[CYCLE_PREFS.cycle_intensity] * DEMO_CADENCE.durationWeeks;

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(`  • Régler les préférences de cycle de Camille : quinzaine, démarrage lundi, intensité « light »`);
    console.log(`  • Créer 1 quinzaine ${window.start} → ${window.end} (objectif ${targetPoints} points)`);
    console.log(`  • Y ranger ${CYCLE_ISSUES.length} tickets de Camille, de 2 projets : ${CYCLE_ISSUES.join(", ")}`);
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  requireProject(world, "AUR");
  requireProject(world, "BCN");

  // 1. La cadence doit être écrite AVANT tout : c'est elle qui définit la
  //    fenêtre que l'application ira chercher.
  await updateDemoUserMetadata(world, {
    userId: people.camille,
    patch: CYCLE_PREFS,
    confirmed: true,
  });
  console.log("  → préférences de cycle réglées sur le compte de Camille");

  // 2. Le cycle de la fenêtre courante.
  const { data: cycles, error } = await world.admin
    .from("cycles")
    .select("id, start_date, end_date, target_points")
    .eq("user_id", people.camille)
    .eq("start_date", window.start);
  if (error) throw new Error(`captures: lecture des cycles — ${error.message}`);

  let cycle = (cycles || [])[0];
  if (!cycle) {
    const plan = createPlan(world);
    plan.insert(
      "cycles",
      [{
        user_id: people.camille,
        start_date: window.start,
        end_date: window.end,
        intensity: CYCLE_PREFS.cycle_intensity,
        target_points: targetPoints,
        // Réclame l'auto-remplissage : sans ça, l'application y verserait
        // d'autres tickets au premier chargement et la capture changerait.
        filled_at: new Date().toISOString(),
      }],
      "quinzaine",
    );
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    cycle = inserted.cycles[0];
    console.log(`  → quinzaine ${cycle.start_date} → ${cycle.end_date} créée`);
  } else {
    console.log(`  → quinzaine ${cycle.start_date} déjà là, réutilisée`);
  }

  // 3. Les tickets. Un par un : `plan.update` relit et vérifie chaque ligne
  //    visée avant de la toucher.
  const issues = await resolveIssues(world, CYCLE_ISSUES);
  const misassigned = issues.filter((i) => i.assignee_id !== people.camille);
  if (misassigned.length > 0) {
    throw new Error(
      `captures: ces tickets ne sont pas assignés à Camille et sortiraient aussitôt du cycle — ` +
        misassigned.map((i) => i.identifier).join(", "),
    );
  }

  const toAttach = issues.filter((i) => i.cycle_id !== cycle.id);
  if (toAttach.length === 0) {
    console.log("  → les 12 tickets sont déjà dans la quinzaine");
  } else {
    const plan = createPlan(world);
    for (const issue of toAttach) {
      plan.update("issues", { id: issue.id }, { cycle_id: cycle.id }, `${issue.identifier} → quinzaine`);
    }
    console.log(plan.describe());
    await plan.apply({ confirmed: true });
    console.log(`  → ${toAttach.length} ticket(s) rangés dans la quinzaine`);
  }

  // 4. Contrôle : le trigger a-t-il gardé nos tickets ? S'il en a éjecté, la
  //    capture montrerait un cycle incomplet sans qu'aucune erreur ne l'ait dit.
  const after = await resolveIssues(world, CYCLE_ISSUES);
  const kept = after.filter((i) => i.cycle_id === cycle.id);
  const points = kept.reduce((sum, i) => sum + (EFFORT_POINTS[i.effort] ?? 3), 0);
  const donePoints = kept
    .filter((i) => i.status === "done" || i.status === "canceled")
    .reduce((sum, i) => sum + (EFFORT_POINTS[i.effort] ?? 3), 0);

  console.log(
    `\n  Quinzaine : ${kept.length}/${CYCLE_ISSUES.length} tickets, ${points} points sur ${targetPoints} ` +
      `(capacité ${Math.round((points / targetPoints) * 100)} %), ` +
      `terminés ${donePoints} points (complétion ${Math.round((donePoints / points) * 100)} %)`,
  );
  if (kept.length !== CYCLE_ISSUES.length) {
    throw new Error(
      `captures: ${CYCLE_ISSUES.length - kept.length} ticket(s) ont été éjectés du cycle par la base.`,
    );
  }
}

await main();
