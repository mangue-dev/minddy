import type { AiProviderChoice } from "./ai-surfaces";

/**
 * A provider an account can choose for an AI call type (MIN-826): Minddy
 * Cloud or one of its credentials. Shared by the server routes and the
 * settings and Numo pickers.
 */
export interface AiProviderOption {
  id: AiProviderChoice;
  label: string;
}
