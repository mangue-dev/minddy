import type { MessageKey } from "@/lib/i18n-keys";
import type { IssuePriorityValue } from "@/lib/issue-validation";

/**
 * The world of public dictation demo (MIN-150).
 *
 * The landing lets a visitor WITHOUT COUNT speak for five seconds and watch the
 * ticket fill up. The ticket produced is disposable: nothing is written in base,
 * no real project is read. However, you need a setting — a ticket without
 * members to assign it to or categories to choose from only demonstrates half of
 * the argument ("all fields fill in", not just the title).
 *
 * This setting is here, and it is FICTITIOUS: three members, three categories, written
 * in hard. The module is shared client/server (no server-only import):
 * - the `/api/demo/dictate` route constructs the prompt and re-validates against
 * everything that the model returns;
 * - the `components/marketing/voice-demo.tsx` block displays the same sentences
 * example.
 *
 * STRINGS ARE NOT HERE, only their keys: member names, names
 * categories and example sentences are visible strings, so they
 * live in `messages/{fr,en}.json` under `Landing`, like the rest of the
 * page. The server reads them back with `getTranslations`, the client with
 * `useTranslations` — a single source, and the i18n contract test keeps it.
 *
 * WHY PHRASE IDENTIFIERS rather than text: the visitor who
 * clicks "try a phrase" only sends an id (`stripe`), never text.
 * The endpoint is open; so he has no free text input to the
 * model, and the only path to one is through a transcription of his
 * own voice.
 */

/** Example sentences, playable without microphone. */
export const DEMO_SAMPLE_IDS = ["stripe", "export", "onboarding"] as const;
export type DemoSampleId = (typeof DEMO_SAMPLE_IDS)[number];

export const isDemoSampleId = (v: unknown): v is DemoSampleId =>
  typeof v === "string" && (DEMO_SAMPLE_IDS as readonly string[]).includes(v);

/** The three members of the demo project. `avatarSeed` powers the portrait. */
export const DEMO_MEMBER_IDS = ["lea", "thomas", "sofia"] as const;
export type DemoMemberId = (typeof DEMO_MEMBER_IDS)[number];

/** The three categories of the demo project. */
export const DEMO_CATEGORY_IDS = ["bug", "feature", "design"] as const;
export type DemoCategoryId = (typeof DEMO_CATEGORY_IDS)[number];

/** i18n keys of the decor and examples, typed: a mistake does not compile. */
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
 * The ticket that the demo returns. Deliberately shorter than the real
 * form: title, description, and the four fields which make it appear that the
 * sentence has been STORED. The effort is not there — a t-shirt size requires
 * to be explained, and the landing does not explain.
 */
export interface DemoTicket {
  title: string;
  description: string;
  priority: IssuePriorityValue;
  /** Short ISO date ("2026-08-07"), formatted by the customer in their language. */
  dueDate: string | null;
  assignee: { id: DemoMemberId; name: string; avatar: string } | null;
  category: { id: DemoCategoryId; name: string } | null;
}

/** Ce que renvoie `POST /api/demo/dictate`. */
export interface DemoDictationResult {
  /** What was heard (or the example phrase played). */
  transcript: string;
  ticket: DemoTicket;
}

/**
 * Customer side socket terminals. The demo is not the dictation of the product: there
 * where the app lets you talk as long as you want, here you stop on your own
 * — a public demo is paid for by each second of audio, and one sentence is enough to
 * the demonstration.
 */
export const DEMO_MAX_RECORDING_MS = 15_000;
/** Product pinned throughput (`DictateButton`): ~6 KB/s. */
export const DEMO_AUDIO_BITS_PER_SECOND = 48_000;
/** Payload ceiling accepted by the road (~1 min of speech). */
export const DEMO_MAX_AUDIO_BYTES = 400 * 1024;
