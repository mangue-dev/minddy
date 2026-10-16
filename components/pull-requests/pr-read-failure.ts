import type { useTranslations } from "next-intl";
import { readFailureKind, readFailureRetryAt } from "@/lib/read-failure";

type PullRequestsTranslator = ReturnType<typeof useTranslations<"PullRequests">>;

/**
 * The wording of a failed pull request read (MIN-691). Session failures are
 * worded by `ReadFailureNotice`; a rate limit says when loading resumes.
 */
export function pullRequestReadFailureMessage(
  t: PullRequestsTranslator,
  error: unknown,
  surface: "detail" | "list",
): string {
  const kind = readFailureKind(error);
  if (kind === "rateLimited") {
    const remaining = readFailureRetryAt(error) - Date.now();
    return t("readRateLimited", { minutes: Math.max(1, Math.ceil(remaining / 60_000)) });
  }
  if (surface === "list") return t("listReadFailed");
  if (kind === "forbidden") return t("readForbidden");
  if (kind === "notFound") return t("readNotFound");
  return t("readFailed");
}
