// Le bonjour de l'accueil : pas une salutation figée, un vivier.
//
// « Bonjour, Clément » à la première visite est courtois ; à la trentième c'est
// du mobilier. Le titre de l'accueil pioche donc dans un vivier qui dépend de
// l'heure LOCALE et du jour — « il est tard » à 23 h, « nouvelle semaine » un
// lundi matin — et tire au sort dans ce qui reste.
//
// Le registre est celui d'un collègue, pas d'un copain : la variété vient de ce
// que le moment a de vrai à dire, jamais d'une blague. Une formule qu'on
// n'écrirait pas dans un message d'équipe n'a rien à faire ici.
//
// Deux règles portent le fichier :
//
//  1. Chaque formule existe en deux clés, avec et sans le nom (`keyNoName`) —
//     comme le couple `greeting` / `greetingNoName` qu'elle rejoint. Le vivier
//     est donc toujours plein, qu'on connaisse le nom de l'utilisateur ou non.
//  2. La plage se calcule sur l'heure LOCALE, que le serveur ne connaît pas (il
//     est en UTC). Le tirage est donc piloté par une graine que l'appelant ne
//     pose qu'APRÈS le montage — sinon le rendu serveur et l'hydratation
//     choisiraient deux phrases différentes. Cf. app/(app)/home/page.tsx.

import type { MessageKey } from "@/lib/i18n-keys";

export interface GreetingVariant {
  /** La formule, nom compris. */
  key: MessageKey<"Home">;
  /** La même, sans le nom — quand le compte n'en porte aucun. */
  keyNoName: MessageKey<"Home">;
}

const pair = (
  key: MessageKey<"Home">,
  keyNoName: MessageKey<"Home">,
): GreetingVariant => ({ key, keyNoName });

/**
 * Les plages de la journée, sur l'heure locale.
 *
 * La nuit s'arrête à minuit au lieu d'y entrer : « bonsoir » est juste à 23 h et
 * faux à 3 h, et le petit matin n'a que deux formules parce qu'il n'en a pas
 * trois d'honnêtes — mieux vaut deux justes que trois dont une sonne creux.
 */
const NIGHT: GreetingVariant[] = [
  pair("greetNightLate", "greetNightLateNoName"),
  pair("greetNightEnd", "greetNightEndNoName"),
];

const MORNING: GreetingVariant[] = [
  pair("greetMorning", "greetMorningNoName"),
  pair("greetMorningNewDay", "greetMorningNewDayNoName"),
  pair("greetMorningStart", "greetMorningStartNoName"),
];

const MIDDAY: GreetingVariant[] = [
  pair("greetMidday", "greetMiddayNoName"),
  pair("greetMiddayHalf", "greetMiddayHalfNoName"),
  pair("greetMiddayLunch", "greetMiddayLunchNoName"),
];

const AFTERNOON: GreetingVariant[] = [
  pair("greetAfternoon", "greetAfternoonNoName"),
  pair("greetAfternoonHello", "greetAfternoonHelloNoName"),
];

const EVENING: GreetingVariant[] = [
  pair("greetEvening", "greetEveningNoName"),
  pair("greetEveningEndOfDay", "greetEveningEndOfDayNoName"),
  pair("greetEveningHave", "greetEveningHaveNoName"),
];

/** Ce que le jour de la semaine ajoute au vivier de l'heure — jamais ce qu'il
    remplace : un samedi soir peut dire « bonsoir » comme « bon week-end ». */
const MONDAY = pair("greetMonday", "greetMondayNoName");
const FRIDAY = pair("greetFriday", "greetFridayNoName");
const WEEKEND = pair("greetWeekend", "greetWeekendNoName");

/** La plage horaire de `hour` (0–23). */
function slotOf(hour: number): GreetingVariant[] {
  if (hour < 5) return NIGHT;
  if (hour < 12) return MORNING;
  if (hour < 14) return MIDDAY;
  if (hour < 18) return AFTERNOON;
  return EVENING;
}

/**
 * Le vivier du moment : la plage horaire, plus l'appoint du jour quand il a
 * quelque chose à dire.
 *
 * Le lundi ne compte que le matin — « nouvelle semaine » à 19 h est faux — et le
 * vendredi cesse d'annoncer la fin de semaine une fois le soir venu, où elle est
 * déjà là.
 */
export function greetingPool(date: Date): GreetingVariant[] {
  const hour = date.getHours();
  const day = date.getDay();
  const slot = slotOf(hour);

  const pool = [...slot];
  if (day === 0 || day === 6) pool.push(WEEKEND);
  else if (day === 1 && slot === MORNING) pool.push(MONDAY);
  else if (day === 5 && (slot === MORNING || slot === MIDDAY || slot === AFTERNOON))
    pool.push(FRIDAY);

  return pool;
}

/**
 * Une formule du vivier, tirée par `seed`. Déterministe à graine égale : c'est
 * ce qui permet à l'appelant de garder la même phrase tant que la page vit, et
 * d'en changer au rechargement suivant.
 */
export function pickGreeting(date: Date, seed: number): GreetingVariant {
  const pool = greetingPool(date);
  return pool[Math.abs(Math.trunc(seed)) % pool.length];
}
