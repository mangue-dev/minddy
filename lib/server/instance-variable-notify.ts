import "server-only";

import { getTranslations } from "next-intl/server";

import { getServiceClient } from "@/lib/supabase-service";
import { capability } from "@/lib/server/capabilities";
import { insertNotifications } from "@/lib/server/notifications";
import { instanceAdminRecipients } from "@/lib/server/instance-variables";
import { displayName } from "@/lib/display-name";
import { SITE_URL } from "@/lib/site";
import { defaultLocale, supportedLocaleForTag, type Locale } from "@/i18n/config";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Tells every administrator that an instance variable changed (MIN-847): an
 * inbox notification always, an email too when the instance sends email.
 * Neither names the variable nor its value — the history of the Instance tab
 * does, behind the admin check. A silent change is the risk this answers: a
 * hijacked administrator session swapping a key would show in every
 * administrator's inbox.
 */
export async function notifyInstanceConfigChange(actorId: string, previousAdminEmails?: string | null): Promise<void> {
  const recipients = await instanceAdminRecipients(actorId, previousAdminEmails);
  if (recipients.length === 0) return;
  const service = getServiceClient();
  // The inbox tells the OTHER administrators; the actor knows what they just
  // did. The email still reaches the actor: it is the alert a hijacked
  // session cannot clear from an inbox.
  const others = recipients.filter((recipient) => recipient.id !== actorId);
  if (others.length > 0) await insertNotifications(
    service,
    others.map((recipient) => ({
      user_id: recipient.id,
      project_id: null,
      type: "instance_config_changed",
      issue_id: null,
      actor_id: actorId,
    })),
  );
  await emailRecipients(actorId, recipients).catch((error: Error) => {
    console.error("[instance-variables] notification email failed:", error.message);
  });
}

async function emailRecipients(actorId: string, recipients: Array<{ id: string; email: string | null }>): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  if (!capability("transactionalEmail").configured || provider !== "resend" || !apiKey || !from) return;

  const service = getServiceClient();
  const actor = (await service.auth.admin.getUserById(actorId)).data?.user;
  const actorName = displayName({
    full_name: (actor?.user_metadata?.display_name ?? actor?.user_metadata?.full_name) as string | undefined,
    email: actor?.email,
  }, "—");
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    const metadata = (await service.auth.admin.getUserById(recipient.id)).data?.user?.user_metadata;
    const locale: Locale = supportedLocaleForTag(typeof metadata?.locale === "string" ? metadata.locale : null) ?? defaultLocale;
    const t = await getTranslations({ locale, namespace: "Admin" });
    const link = `${SITE_URL}/admin?tab=instance`;
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient.email],
        subject: t("instance.emailSubject"),
        text: t("instance.emailBody", { actor: actorName, link }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("[instance-variables] provider_request_refused", { status: response.status });
  }
}
