import "server-only";

/**
 * Envoi du code OTP par email via Resend (fetch brut, même philosophie que le
 * client OpenRouter — pas de dépendance). Sans RESEND_API_KEY (dev), le code
 * est loggé en console et l'envoi est considéré réussi : le flux complet reste
 * testable en local.
 */

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "minddy <feedback@minddy.app>";

export interface SendOtpEmailParams {
  to: string;
  code: string;
  projectName: string;
  locale: "fr" | "en";
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[feedback-otp] (dev — no RESEND_API_KEY) code for ${params.to}: ${params.code}`);
    return true;
  }

  const subject =
    params.locale === "fr"
      ? `${params.code} — votre code de vérification`
      : `${params.code} — your verification code`;
  const text =
    params.locale === "fr"
      ? `Votre code de vérification pour le board de feedback « ${params.projectName} » : ${params.code}\n\nIl expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`
      : `Your verification code for the "${params.projectName}" feedback board: ${params.code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`;

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.FEEDBACK_EMAIL_FROM || DEFAULT_FROM,
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
