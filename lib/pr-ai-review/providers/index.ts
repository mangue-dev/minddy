import { codex } from "./codex";
import { coderabbit } from "./coderabbit";
import { greptile } from "./greptile";
import type { AiReviewProvider } from "../types";

/** Register new adapters here; transport and UI need no provider branches. */
export const AI_REVIEW_PROVIDERS: readonly AiReviewProvider[] = [
  codex,
  coderabbit,
  greptile,
];

export function aiReviewProviderForLogin(
  login: string | null | undefined,
): AiReviewProvider | null {
  if (!login) return null;
  const normalized = login.toLowerCase();
  return (
    AI_REVIEW_PROVIDERS.find((provider) =>
      provider.githubLogins.includes(normalized),
    ) ?? null
  );
}
