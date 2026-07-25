/**
 * La fenêtre du cycle courant, calculée EXACTEMENT comme l'application.
 *
 * Pourquoi cette duplication : le cycle affiché n'est pas celui qu'on choisit,
 * c'est celui que le serveur déduit de la date du jour. `reconcileCycles`
 * (lib/server/cycles.ts) calcule la fenêtre contenant « aujourd'hui » à partir
 * de la cadence du compte, puis CRÉE la ligne si elle manque. Un cycle seedé
 * sur d'autres dates serait donc rangé dans le passé, et l'écran montrerait un
 * cycle vide fraîchement créé à côté.
 *
 * Conséquence importante : l'horloge figée des captures (`CAPTURE.frozenNow`)
 * ne s'applique qu'au NAVIGATEUR. Le serveur, lui, tourne à l'heure réelle.
 * Les données du cycle sont donc datées relativement à la fenêtre courante,
 * recalculée à chaque exécution du seed — et elles périment quand la fenêtre
 * bascule. Relancer 003 et 004 suffit à les remettre à jour.
 *
 * Miroir de `cycleStartOf` dans lib/cycle.ts. Toute divergence casse le
 * rattachement — cette fonction et celle de l'app doivent rester identiques.
 */

const DAY_MS = 86_400_000;

/** 1970-01-05 est un lundi : l'ancrage qui fixe la parité des quinzaines. */
const EPOCH_MONDAY = "1970-01-05";

/**
 * Cadence du compte de démo. Doit correspondre aux métadonnées écrites sur le
 * compte par 004-cycle.mjs (`cycle_duration_weeks`, `cycle_start_dow`), sinon
 * l'application recalculera une autre fenêtre que celle qu'on a semée.
 */
export const DEMO_CADENCE = { startDow: 1, durationWeeks: 2 };

const toUTC = (date) => Date.parse(`${date}T00:00:00.000Z`);
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, days) => fromUTC(toUTC(date) + days * DAY_MS);
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

/** Date du jour, à l'heure RÉELLE — c'est celle que verra le serveur. */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Début de la fenêtre contenant `date`, pour la cadence donnée. */
export function cycleStartOf(date, cadence = DEMO_CADENCE) {
  const anchor = addDays(EPOCH_MONDAY, cadence.startDow - 1);
  const periodDays = cadence.durationWeeks * 7;
  const elapsed = diffDays(anchor, date);
  return addDays(anchor, Math.floor(elapsed / periodDays) * periodDays);
}

/** La fenêtre courante : `end` est EXCLUSIVE (= début de la suivante). */
export function currentCycleWindow(cadence = DEMO_CADENCE, today = todayISO()) {
  const start = cycleStartOf(today, cadence);
  return {
    start,
    end: addDays(start, cadence.durationWeeks * 7),
    today,
    lengthDays: cadence.durationWeeks * 7,
  };
}

/**
 * Un instant daté dans la fenêtre : `dayOffset` jours après son début, à
 * l'heure `hour` (UTC).
 *
 * Borné deux fois : par la fin de la fenêtre, pour qu'aucune donnée ne tombe
 * hors du cycle qu'elle illustre ; et par AUJOURD'HUI, parce qu'un ticket créé
 * ou terminé demain se lirait « dans 2 jours » à l'écran. Selon le moment où
 * le seed tourne dans la quinzaine, plusieurs jours se replient donc sur le
 * jour courant — c'est voulu, mieux vaut tasser que dater dans le futur.
 */
export function dayInWindow(window, dayOffset, hour = 10) {
  const clamped = Math.max(0, Math.min(dayOffset, elapsedDays(window)));
  const day = addDays(window.start, clamped);
  return `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/** Jours écoulés depuis le début de la fenêtre, sans dépasser sa fin. */
export function elapsedDays(window) {
  return Math.max(0, Math.min(window.lengthDays - 1, diffDays(window.start, window.today)));
}

/**
 * Un instant réparti PROPORTIONNELLEMENT dans la partie déjà écoulée de la
 * fenêtre : `fraction` 0 = son début, 1 = aujourd'hui.
 *
 * C'est ce qu'utilisent les seeds plutôt qu'un décalage en jours fixe. Une
 * quinzaine semée le 3e jour n'a que 3 jours de passé : des offsets en dur
 * s'écraseraient tous sur aujourd'hui, et toutes les dates afficheraient
 * « à l'instant ». Avec une fraction, la donnée reste étalée quel que soit le
 * moment où le seed tourne.
 */
export function spreadInWindow(window, fraction, hour = 10) {
  const span = elapsedDays(window);
  const clamped = Math.max(0, Math.min(1, fraction));
  return dayInWindow(window, Math.round(clamped * span), hour);
}
