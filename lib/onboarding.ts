// minddy — MIN-74 : onboarding du nouveau compte.
//
// Quatre étapes, franchies sur `/home` : créer ou rejoindre son premier projet,
// faire entrer ses premiers tickets (à la main ou par import CSV, MIN-98),
// connecter un agent au serveur MCP, activer les cycles. Deux d'entre elles se
// cochent SEULES à partir d'une donnée réelle (le projet existe, un ticket
// existe) ; les autres sont acquittées explicitement par l'utilisateur —
// importer son backlog et connecter un agent sont des propositions, pas des
// obligations.
//
// RIEN NE BLOQUE. C'est la leçon d'AutoKap, dont l'onboarding exigeait une
// connexion GitHub dès l'étape 1 : un seul onboarding complété en 120 jours.
// Ici chaque étape est franchissable et l'onboarding entier se passe.
//
// L'état vit dans `user_metadata` (auth Supabase), comme les préférences de
// cycles : pas de table, pas de migration. Server-safe (aucun import React) —
// le résolveur est partageable avec un route handler si le besoin vient.

export const ONBOARDING_STEPS = ["project", "tickets", "mcp", "cycles"] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** Ids d'étapes disparus, encore présents dans les métadonnées des comptes qui
 *  ont commencé l'onboarding avant la fusion « premier ticket » + « importer »
 *  en une seule étape `tickets`. Ils ne sont plus des étapes — seulement des
 *  traces à relire pour ne pas rouvrir un onboarding déjà avancé. */
const LEGACY_ACK_IDS = ["issue", "import"] as const;

/** Étapes acquittées à la main (tableau d'ids) — les autres se déduisent. */
export const ONBOARDING_STEPS_META_KEY = "onboarding_steps";
/** « Passer l'onboarding » : il ne réapparaît plus, même incomplet. */
export const ONBOARDING_DISMISSED_META_KEY = "onboarding_dismissed";
/** Posé la première fois que l'onboarding s'affiche — voir `eligible`. */
export const ONBOARDING_STARTED_META_KEY = "onboarding_started";

/** Signaux réels lus dans l'app — ce que l'utilisateur a vraiment fait. */
export interface OnboardingSignals {
  projectCount: number;
  issueCount: number;
  cyclesEnabled: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  completed: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  /** Première étape non franchie, ou null si tout est fait. */
  currentStepId: OnboardingStepId | null;
  /** Rang 1-basé de l'étape courante, pour « Étape 2 sur 5 ». */
  currentStepNumber: number;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  dismissed: boolean;
  /** Le compte était neuf quand l'onboarding l'a vu pour la première fois. */
  eligible: boolean;
  /** Compte neuf éligible dont l'entrée n'est pas encore gravée : l'appelant
   *  doit poser `onboarding_started` (sinon créer projet + ticket rendrait le
   *  compte « installé » et le ferait sortir de l'onboarding en cours de route). */
  needsStartStamp: boolean;
  /** Seule chose que la home a besoin de savoir pour afficher la carte. */
  visible: boolean;
}

function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return (ONBOARDING_STEPS as readonly unknown[]).includes(value);
}

/** Le tableau brut, ids inconnus compris : c'est là que vivent les étapes
 *  disparues (`LEGACY_ACK_IDS`), qu'il faut relire pour la reprise des comptes
 *  entamés avant la fusion. Rien d'autre ne devrait l'utiliser. */
function readRawAcknowledged(
  meta: Record<string, unknown> | null | undefined
): Set<string> {
  const raw = meta?.[ONBOARDING_STEPS_META_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string"));
}

/** Étapes acquittées, lues défensivement : les métadonnées auth sont du JSON
 *  libre, un tableau absent / mal typé / porteur d'ids inconnus ne doit pas
 *  faire tomber la home. */
export function readAcknowledgedSteps(
  meta: Record<string, unknown> | null | undefined
): Set<OnboardingStepId> {
  const raw = meta?.[ONBOARDING_STEPS_META_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter(isOnboardingStepId));
}

/** Ajoute une étape à la liste acquittée, dans l'ordre canonique et sans
 *  doublon — le patch à écrire dans `user_metadata`. */
export function withAcknowledgedStep(
  meta: Record<string, unknown> | null | undefined,
  step: OnboardingStepId
): OnboardingStepId[] {
  const acknowledged = readAcknowledgedSteps(meta);
  acknowledged.add(step);
  return ONBOARDING_STEPS.filter((id) => acknowledged.has(id));
}

/**
 * Fusionne les acquittements persistés avec les signaux réels.
 *
 * ÉLIGIBILITÉ. L'onboarding s'adresse aux comptes NEUFS : il prend la place du
 * corps de la home, ce qui n'a de sens que quand il n'y a rien à y montrer. Un
 * compte déjà installé (des projets, des tickets) ne doit pas se faire
 * confisquer sa home pour une étape « connecter un agent » qu'il n'a jamais
 * demandée. Le compte est éligible s'il est vide au premier regard — et le
 * reste ensuite grâce à `onboarding_started`, sans quoi créer son projet et son
 * ticket le ferait basculer « installé » et le ferait sortir de l'onboarding
 * juste après avoir coché ses deux premières étapes.
 */
export function resolveOnboardingState({
  meta,
  projectCount,
  issueCount,
  cyclesEnabled,
}: OnboardingSignals & {
  meta: Record<string, unknown> | null | undefined;
}): OnboardingState {
  const acknowledged = readAcknowledgedSteps(meta);
  const raw = readRawAcknowledged(meta);

  const isCompleted = (id: OnboardingStepId): boolean => {
    if (acknowledged.has(id)) return true;
    switch (id) {
      case "project":
        return projectCount > 0;
      // Un ticket existe : créé à la main ou importé, la distinction ne se voit
      // pas dans la donnée et n'a pas à se voir ici. Sans ticket, l'étape se
      // passe explicitement (« Passer cette étape » → acquittement).
      //
      // REPRISE DES COMPTES ENTAMÉS. Les deux étapes fusionnées ici étaient
      // `issue` (auto) et `import` (acquittée). Un compte qui portait l'une de
      // ces marques était déjà PLUS LOIN que la nouvelle étape `tickets` : la
      // relire évite de le renvoyer en arrière. Idem pour `mcp`, qui suivait
      // les deux — donc les impliquait.
      case "tickets":
        return (
          issueCount > 0 ||
          acknowledged.has("mcp") ||
          LEGACY_ACK_IDS.some((legacy) => raw.has(legacy))
        );
      // Connecter un agent ne laisse pas de trace exploitable côté client : cette
      // étape est informative et se valide sur « Continuer » (acquittement).
      case "mcp":
        return false;
      case "cycles":
        return cyclesEnabled;
    }
  };

  const steps = ONBOARDING_STEPS.map((id) => ({ id, completed: isCompleted(id) }));
  const currentIndex = steps.findIndex((s) => !s.completed);
  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = currentIndex === -1;
  const dismissed = meta?.[ONBOARDING_DISMISSED_META_KEY] === true;

  const started = meta?.[ONBOARDING_STARTED_META_KEY] === true;
  const blankAccount = projectCount === 0 && issueCount === 0;
  const eligible = started || blankAccount;
  const visible = eligible && !dismissed && !allComplete;

  return {
    steps,
    currentStepId: allComplete ? null : steps[currentIndex].id,
    currentStepNumber: allComplete ? steps.length : currentIndex + 1,
    completedCount,
    totalCount: steps.length,
    allComplete,
    dismissed,
    eligible,
    needsStartStamp: visible && !started,
    visible,
  };
}
