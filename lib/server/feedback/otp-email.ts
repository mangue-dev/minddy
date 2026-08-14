import "server-only";

/**
 * Envoi du code OTP par email via Resend (fetch brut, même philosophie que le
 * client OpenRouter — pas de dépendance). Sans RESEND_API_KEY (dev), le code
 * est loggé en console et l'envoi est considéré réussi : le flux complet reste
 * testable en local.
 *
 * Le corps ne dit PAS de quel board vient la demande (MIN-342). Un anonyme
 * choisit le destinataire de cet e-mail ; y interpoler le nom d'un projet —
 * choisi librement par qui ouvre un board — revenait à louer le domaine vérifié
 * de minddy pour écrire une ligne de texte chez n'importe qui. Ce qui reste
 * est entièrement écrit par nous : un code, et à quoi il sert.
 */

const RESEND_URL = "https://api.resend.com/emails";
// `mail.minddy.app` et pas la racine : c'est le sous-domaine vérifié dans
// Resend, la racine ne l'est plus (cf. `lib/server/invitation-email.ts`).
const DEFAULT_FROM = "minddy <feedback@mail.minddy.app>";

export interface SendOtpEmailParams {
  to: string;
  code: string;
  locale: "fr" | "en";
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Le fallback console est un outil de DEV : en prod, un code valide écrit
    // dans les logs Vercel est un secret qui fuit (MIN-118) — on échoue.
    if (process.env.NODE_ENV === "production") {
      console.error("[feedback-otp] RESEND_API_KEY is not set — OTP not sent");
      return false;
    }
    console.log(`[feedback-otp] (dev — no RESEND_API_KEY) code for ${params.to}: ${params.code}`);
    return true;
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
