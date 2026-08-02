import type { MessageKey } from "@/lib/i18n-keys";
import type { IssuePriorityValue } from "@/lib/issue-validation";

/**
 * Le monde de la démo de dictée publique (MIN-150).
 *
 * La landing laisse un visiteur SANS COMPTE parler cinq secondes et voir le
 * ticket se remplir. Le ticket produit est jetable : rien n'est écrit en base,
 * aucun projet réel n'est lu. Il faut pourtant un décor — un ticket sans
 * membres à qui l'assigner ni catégories à choisir ne démontre que la moitié de
 * l'argument (« tous les champs se remplissent », pas seulement le titre).
 *
 * Ce décor est ici, et il est FICTIF : trois membres, trois catégories, écrits
 * en dur. Le module est partagé client/serveur (aucun import server-only) :
 *   - la route `/api/demo/dictate` en construit le prompt et re-valide contre
 *     lui tout ce que le modèle renvoie ;
 *   - le bloc `components/marketing/voice-demo.tsx` affiche les mêmes phrases
 *     d'exemple.
 *
 * LES CHAÎNES NE SONT PAS ICI, seulement leurs clés : noms des membres, noms
 * des catégories et phrases d'exemple sont des chaînes visibles, donc elles
 * vivent dans `messages/{fr,en}.json` sous `Landing`, comme le reste de la
 * page. Le serveur les relit avec `getTranslations`, le client avec
 * `useTranslations` — une seule source, et le test de contrat i18n la garde.
 *
 * POURQUOI DES IDENTIFIANTS DE PHRASE plutôt que le texte : le visiteur qui
 * clique « essayez une phrase » n'envoie qu'un id (`stripe`), jamais du texte.
 * L'endpoint est ouvert ; il n'a donc aucune entrée en texte libre vers le
 * modèle, et le seul chemin qui en produit passe par une transcription de sa
 * propre voix.
 */

/** Les phrases d'exemple, jouables sans micro. */
export const DEMO_SAMPLE_IDS = ["stripe", "export", "onboarding"] as const;
export type DemoSampleId = (typeof DEMO_SAMPLE_IDS)[number];

export const isDemoSampleId = (v: unknown): v is DemoSampleId =>
  typeof v === "string" && (DEMO_SAMPLE_IDS as readonly string[]).includes(v);

/** Les trois membres du projet de démo. `avatarSeed` alimente le portrait. */
export const DEMO_MEMBER_IDS = ["lea", "thomas", "sofia"] as const;
export type DemoMemberId = (typeof DEMO_MEMBER_IDS)[number];

/** Les trois catégories du projet de démo. */
export const DEMO_CATEGORY_IDS = ["bug", "feature", "design"] as const;
export type DemoCategoryId = (typeof DEMO_CATEGORY_IDS)[number];

/** Clés i18n du décor et des exemples, typées : une faute ne compile pas. */
export const DEMO_SAMPLE_KEYS: Record<DemoSampleId, MessageKey<"Landing">> = {
  stripe: "voiceDemoSample_stripe",
  export: "voiceDemoSample_export",
  onboarding: "voiceDemoSample_onboarding",
};

export const DEMO_MEMBER_KEYS: Record<DemoMemberId, MessageKey<"Landing">> = {
  lea: "voiceDemoMember_lea",
  thomas: "voiceDemoMember_thomas",
  sofia: "voiceDemoMember_sofia",
};

export const DEMO_CATEGORY_KEYS: Record<DemoCategoryId, MessageKey<"Landing">> = {
  bug: "voiceDemoCategory_bug",
  feature: "voiceDemoCategory_feature",
  design: "voiceDemoCategory_design",
};

/**
 * Le ticket que la démo renvoie. Volontairement plus court que le vrai
 * formulaire : titre, description, et les quatre champs qui font sentir que la
 * phrase a été RANGÉE. L'effort n'y est pas — une taille de t-shirt demande
 * d'être expliquée, et la landing n'explique pas.
 */
export interface DemoTicket {
  title: string;
  description: string;
  priority: IssuePriorityValue;
  /** Date ISO courte ("2026-08-07"), formatée par le client dans sa langue. */
  dueDate: string | null;
  assignee: { id: DemoMemberId; name: string; avatar: string } | null;
  category: { id: DemoCategoryId; name: string } | null;
}

/** Ce que renvoie `POST /api/demo/dictate`. */
export interface DemoDictationResult {
  /** Ce qui a été entendu (ou la phrase d'exemple jouée). */
  transcript: string;
  ticket: DemoTicket;
}

/**
 * Bornes de la prise côté client. La démo n'est pas la dictée du produit : là
 * où l'app laisse parler aussi longtemps qu'on veut, ici on s'arrête tout seul
 * — une démo publique se paye à chaque seconde d'audio, et une phrase suffit à
 * la démonstration.
 */
export const DEMO_MAX_RECORDING_MS = 15_000;
/** Débit épinglé du produit (`DictateButton`) : ~6 Ko/s. */
export const DEMO_AUDIO_BITS_PER_SECOND = 48_000;
/** Plafond de charge utile accepté par la route (~1 min de parole). */
export const DEMO_MAX_AUDIO_BYTES = 400 * 1024;
