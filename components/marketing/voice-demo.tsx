import { getTranslations } from "next-intl/server";
import { VoiceDemoPlayer } from "./voice-demo-player";

/**
 * The SERVER envelope of the dictation demo (MIN-150).
 *
 * It only exists for one reason: `Field` and `Priority` are not part of
 * of the namespaces served to the browser on the site public
 * (`lib/public-client-messages.ts` — the full catalog was 39 KB gzipped
 * into the document). Reading them here and passing the nine titles in props costs
 * a few dozen bytes in the RSC feed, and keeps the demo aligned with the
 * exact words of the app: if "Expiration" changes in the product, it changes here.
 */
export async function VoiceDemo() {
  const [tField, tPriority] = await Promise.all([
    getTranslations("Field"),
    getTranslations("Priority"),
  ]);

  return (
    <VoiceDemoPlayer
      labels={{
        priority: tField("priority"),
        dueDate: tField("dueDate"),
        assignee: tField("assignee"),
        categories: tField("categories"),
        priorities: {
          none: tPriority("none"),
          urgent: tPriority("urgent"),
          high: tPriority("high"),
          medium: tPriority("medium"),
          low: tPriority("low"),
        },
      }}
    />
  );
}
