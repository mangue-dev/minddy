import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * Le board de feedback public — une section entière, pas une case de grille.
 *
 * Deux captures (la page publique, puis la même demande vue côté équipe) parce
 * que la fonctionnalité a deux faces, et quatre temps numérotés pour le trajet
 * d'un retour : posté → regroupé → tranché → suivi. Tout ce qui est décrit ici
 * existe : SSO du board, détection des doublons à la publication, fusion des
 * votes, réponse d'équipe, promotion en ticket et statut public aligné sur le
 * ticket lié.
 */

const STEPS = ["post", "dedupe", "decide", "status"] as const;

export async function SectionFeedback() {
  const t = await getTranslations("Landing");

  return (
    <section id="feedback" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("feedbackTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("feedbackSubtitle")}
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="feedbackBoard" />
            <figcaption className="text-sm text-muted-foreground">
              {t("feedbackCaptionBoard")}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="feedbackInbox" />
            <figcaption className="text-sm text-muted-foreground">
              {t("feedbackCaptionInbox")}
            </figcaption>
          </figure>
        </div>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step} className="bg-card p-6">
              <span className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/60 font-mono text-sm text-muted-foreground">
                {index + 1}
              </span>
              <h3 className="mb-1.5 font-medium">{t(`feedback_${step}_title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`feedback_${step}_body`)}
              </p>
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-pretty text-muted-foreground">
          {t("feedbackNote")}
        </p>
      </div>
    </section>
  );
}
