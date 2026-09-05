import { getTranslations } from "next-intl/server";
import { Command, Mic, NotebookPen } from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { VoiceDemo } from "./voice-demo";
import { FeatureDisclosure } from "./feature-disclosure";

const SCRATCHPAD_POINTS = ["write", "prompt", "agent", "promote", "mcp"] as const;
const VOICE_WAYS = ["create", "edit", "everywhere"] as const;

/** Keep everyday shortcuts compact, with the voice demo available on demand. */
export async function SectionSpeed() {
  const t = await getTranslations("Landing");

  return (
    <section id="speed" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 grid gap-5 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <h2 className="max-w-xl text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">{t("speedTitle")}</h2>
          <p className="max-w-md self-end leading-relaxed text-muted-foreground">{t("speedSubtitle")}</p>
        </header>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <article className="min-w-0 rounded-xl border border-border p-6">
            <Command className="mb-8 size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h3 className="text-lg font-medium tracking-tight lg:min-h-14">{t("feature_palette_title")}</h3>
            <p className="mt-3 mb-6 text-sm leading-relaxed text-muted-foreground lg:min-h-[4.5rem]">{t("feature_palette_body")}</p>
            <FeatureDisclosure title={t("feature_palette_title")}>
              <ScreenshotSlot id="featurePalette" sizes="(min-width: 1024px) 336px, calc(100vw - 96px)" className="shadow-none" />
            </FeatureDisclosure>
          </article>
          <article id="voice" className="min-w-0 scroll-mt-24 rounded-xl border border-border p-6">
            <Mic className="mb-8 size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h3 className="text-lg font-medium tracking-tight lg:min-h-14">{t("voiceTitle")}</h3>
            <p className="mt-3 mb-6 text-sm leading-relaxed text-muted-foreground lg:min-h-[4.5rem]">{t("voiceSubtitle")}</p>
            <FeatureDisclosure title={t("voiceTitle")}>
              <dl className="space-y-4">
                {VOICE_WAYS.map((key) => (
                  <div key={key}>
                    <dt className="font-medium">{t(`voice_${key}_title`)}</dt>
                    <dd className="mt-1 text-muted-foreground">{t(`voice_${key}_body`)}</dd>
                  </div>
                ))}
              </dl>
            </FeatureDisclosure>
          </article>
          <article id="scratchpad" className="min-w-0 scroll-mt-24 rounded-xl border border-border p-6">
            <NotebookPen className="mb-8 size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h3 className="text-lg font-medium tracking-tight lg:min-h-14">{t("scratchpadTitle")}</h3>
            <p className="mt-3 mb-6 text-sm leading-relaxed text-muted-foreground lg:min-h-[4.5rem]">{t("scratchpadSubtitle")}</p>
            <FeatureDisclosure title={t("scratchpadTitle")}>
              <ScreenshotSlot id="scratchpad" sizes="(min-width: 1024px) 336px, calc(100vw - 96px)" className="mb-5" />
              <ul className="list-outside list-disc space-y-2 pl-4 text-muted-foreground">
                {SCRATCHPAD_POINTS.map((key) => <li key={key}>{t(`scratchpadPoint_${key}`)}</li>)}
              </ul>
            </FeatureDisclosure>
          </article>
        </div>
        <div className="mt-6">
          <FeatureDisclosure title={t("voiceTitle")} label={t("voiceDemoStart")}>
            <VoiceDemo />
          </FeatureDisclosure>
        </div>
      </div>
    </section>
  );
}
