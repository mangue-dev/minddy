import "server-only";

import { capability } from "@/lib/server/capabilities";

/**
 * Sending the OTP code by email via Resend (raw fetch, same philosophy as the
 * OpenRouter client — no dependency). Resend is opt-in via
 * `EMAIL_PROVIDER=resend`; `console` keeps the flow testable in development.
 *
 * The body does NOT say which board the request comes from (MIN-342). An anonymous
 * chooses the recipient of this email; interpolating the name of a project —
 * freely chosen by anyone opening a board — amounted to renting the verified domain
 * from minddy to write a line of text for anyone. What remains
 * is entirely written by us: a code, and what it is used for.
 */

const RESEND_URL = "https://api.resend.com/emails";
export interface SendOtpEmailParams {
  to: string;
  code: string;
  locale: "fr" | "en";
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<boolean> {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_EMAIL_FROM?.trim();
  if (provider === "console" && process.env.NODE_ENV !== "production") {
    console.log(`[feedback-otp] (dev — no RESEND_API_KEY) code for ${params.to}: ${params.code}`);
    return true;
  }
  const emailCapability = capability("transactionalEmail");
  if (!emailCapability.configured || provider !== "resend" || !apiKey || !from) {
    console.error(
      `[feedback-otp] email disabled — ${emailCapability.diagnostic}`,
    );
    return false;
  }

  const subject =
    params.locale === "fr"
      ? `${params.code} — votre code de vérification`
      : `${params.code} — your verification code`;
  const text =
    params.locale === "fr"
      ? `Votre code de vérification : ${params.code}\n\nSaisissez-le sur la page de retours où vous venez de renseigner cette adresse. Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — rien n'a été créé.`
      : `Your verification code: ${params.code}\n\nEnter it on the feedback page where you just gave this address. It expires in 10 minutes. If you didn't request this, you can ignore this email — nothing was created.`;

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`[feedback-otp] Resend error (${response.status}): ${detail.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[feedback-otp] send failed:", (err as Error).message);
    return false;
  }
}
