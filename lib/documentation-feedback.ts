import type { Locale } from "@/i18n/config";
import { FEEDBACK_BODY_MAX } from "@/lib/feedback/types";

export interface DocumentationFeedbackContext {
  articleId: string;
  locale: Locale;
}

/** Reserve room for server-added article metadata in the integration body. */
export const DOCUMENTATION_FEEDBACK_DESCRIPTION_MAX = FEEDBACK_BODY_MAX - 1024;
