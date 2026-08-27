import "server-only";

import { capability } from "@/lib/server/capabilities";
import type { Locale } from "@/i18n/config";

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
  locale: Locale;
}

const OTP_COPY: Record<
  Locale,
  {
    subject: (code: string) => string;
    text: (code: string) => string;
  }
> = {
  en: {
    subject: (code) => `${code} — your verification code`,
    text: (code) =>
      `Your verification code: ${code}\n\nEnter it on the feedback page where you just gave this address. It expires in 10 minutes. If you didn't request this, you can ignore this email — nothing was created.`,
  },
  fr: {
    subject: (code) => `${code} — votre code de vérification`,
    text: (code) =>
      `Votre code de vérification : ${code}\n\nSaisissez-le sur la page de retours où vous venez de renseigner cette adresse. Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — rien n'a été créé.`,
  },
  de: {
    subject: (code) => `${code} — dein Bestätigungscode`,
    text: (code) =>
      `Dein Bestätigungscode: ${code}\n\nGib ihn auf der Feedback-Seite ein, auf der du gerade diese Adresse angegeben hast. Er läuft in 10 Minuten ab. Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren — es wurde nichts erstellt.`,
  },
  "pt-BR": {
    subject: (code) => `${code} — seu código de verificação`,
    text: (code) =>
      `Seu código de verificação: ${code}\n\nDigite-o na página de feedback em que você informou este endereço. Ele expira em 10 minutos. Se você não fez esta solicitação, ignore este e-mail — nada foi criado.`,
  },
  it: {
    subject: (code) => `${code} — il tuo codice di verifica`,
    text: (code) =>
      `Il tuo codice di verifica: ${code}\n\nInseriscilo nella pagina dei feedback in cui hai appena indicato questo indirizzo. Scade tra 10 minuti. Se non hai effettuato questa richiesta, ignora questa email — non è stato creato nulla.`,
  },
  es: {
    subject: (code) => `${code} — tu código de verificación`,
    text: (code) =>
      `Tu código de verificación: ${code}\n\nIntrodúcelo en la página de comentarios donde acabas de indicar esta dirección. Caduca en 10 minutos. Si no hiciste esta solicitud, ignora este correo — no se ha creado nada.`,
  },
};

export async function sendOtpEmail(
  params: SendOtpEmailParams,
): Promise<boolean> {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_EMAIL_FROM?.trim();
  if (provider === "console" && process.env.NODE_ENV !== "production") {
    console.log(
      `[feedback-otp] (dev — no RESEND_API_KEY) code for ${params.to}: ${params.code}`,
    );
    return true;
  }
  const emailCapability = capability("transactionalEmail");
  if (
    !emailCapability.configured ||
    provider !== "resend" ||
    !apiKey ||
    !from
  ) {
    console.error(
      `[feedback-otp] email disabled — ${emailCapability.diagnostic}`,
    );
    return false;
  }

  const copy = OTP_COPY[params.locale];
  const subject = copy.subject(params.code);
  const text = copy.text(params.code);

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
      console.error(
        `[feedback-otp] Resend error (${response.status}): ${detail.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[feedback-otp] send failed:", (err as Error).message);
    return false;
  }
}
