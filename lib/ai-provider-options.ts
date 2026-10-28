import type { AiProviderChoice } from "./ai-surfaces";

/**
 * A provider an account can choose for an AI usage (MIN-826): Minddy Cloud or
 * one of its credentials. Shared by the server routes and the settings and
 * Numo pickers.
 */
export interface AiProviderOption {
  id: AiProviderChoice;
  label: string;
  /**
   * Model families of the usage this provider does not offer: those calls
   * stay on Minddy Cloud (transcription on Anthropic, for instance).
   */
  fallbackCapabilities: string[];
}
