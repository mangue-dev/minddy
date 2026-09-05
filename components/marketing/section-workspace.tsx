import { getTranslations } from "next-intl/server";
import { Command, FileText, Layers, MessagesSquare, NotebookPen } from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { FeatureDisclosure } from "./feature-disclosure";
import { CARD_TONES } from "./card-tones";
import { SectionHeading } from "./section-heading";
import { VoiceDemo } from "./voice-demo";

/** One workspace tour: planning, knowledge, feedback, and fast ways to capture work. */
export async function SectionWorkspace() {
  const t = await getTranslations("Landing");
  const cards = [
    {
      id: "tracker", icon: Layers, title: t("navMenu_tracker_title"), description: t("feature_board_body"),
      screenshot: "heroBoard", tone: CARD_TONES.sage, span: "lg:col-span-2",
      points: (["board", "all", "inbox", "objectives", "cycles", "triage"] as const).map(key => ({ title: t(`feature_${key}_title`), body: t(`feature_${key}_body`) })),
    },
    {
      id: "pages", icon: FileText, title: t("pagesTitle"), description: t("pagesSubtitle"),
      screenshot: "pagesEditor", tone: CARD_TONES.lavender, span: "",
      points: (["write", "link", "agents", "publish"] as const).map(key => ({ title: t(`pages_${key}_title`), body: t(`pages_${key}_body`) })),
    },
    {
      id: "feedback", icon: MessagesSquare, title: t("navMenu_feedback_title"), description: t("feedbackSubtitle"),
      screenshot: "feedbackBoard", tone: CARD_TONES.peach, span: "",
      points: (["post", "moderate", "decide", "status"] as const).map(key => ({ title: t(`feedback_${key}_title`), body: t(`feedback_${key}_body`) })),
    },
    {
      id: "speed", icon: Command, title: t("feature_palette_title"), description: t("feature_palette_body"),
      screenshot: "featurePalette", tone: CARD_TONES.butter, span: "",
      points: [{ title: t("feature_palette_title"), body: t("feature_palette_body") }],
    },
    {
      id: "scratchpad", icon: NotebookPen, title: t("scratchpadTitle"), description: t("scratchpadSubtitle"),
      screenshot: "scratchpad", tone: CARD_TONES.rose, span: "",
      points: (["write", "prompt", "agent", "promote", "mcp"] as const).map(key => ({ title: "", body: t(`scratchpadPoint_${key}`) })),
    },
  ] as const;

  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="workspace-title">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="workspace-title" title={t("featuresTitle")} description={t("featuresSubtitle")} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => (
            <FeatureDisclosure key={card.id} id={card.id} title={card.title}
              className={`h-[460px] sm:h-[480px] ${card.tone} ${card.span}`}
              details={<dl className="space-y-5">{card.points.map(point => (
                <div key={point.body}>
                  {point.title && <dt className="font-medium">{point.title}</dt>}
                  <dd className="mt-1 opacity-85">{point.body}</dd>
                </div>
              ))}</dl>}
            >
              <div className="flex h-full flex-col px-6 pt-6 pb-20 sm:px-8 sm:pt-8">
                <card.icon className="mb-5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                <h3 className="text-xl font-medium tracking-tight sm:text-2xl">{card.title}</h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-80">{card.description}</p>
                <div className="relative -mx-6 mt-6 min-h-0 flex-1 overflow-hidden sm:-mx-8">
                  <ScreenshotSlot id={card.screenshot}
                    sizes={card.id === "tracker" ? "(min-width: 1024px) 752px, 100vw" : "(min-width: 1024px) 520px, 100vw"}
                    className={`absolute border-black/10 shadow-none dark:border-white/10 ${
                      card.id === "tracker" ? "top-0 left-6 w-[145%] sm:left-8 lg:w-[calc(100%_-_3rem)]" :
                      card.id === "scratchpad" ? "-top-12 -left-6 w-[140%]" :
                      card.id === "speed" ? "top-0 -left-6 w-[140%]" :
                      "top-0 left-6 w-[140%] sm:left-8"
                    }`} />
                </div>
              </div>
            </FeatureDisclosure>
          ))}
          <article id="voice" className={`min-w-0 scroll-mt-24 rounded-2xl p-6 sm:p-8 md:col-span-2 lg:col-span-3 ${CARD_TONES.sky}`}>
            <h3 className="text-2xl font-medium tracking-tight">{t("voiceTitle")}</h3>
            <p className="mt-3 mb-7 max-w-2xl text-sm leading-relaxed opacity-80">{t("voiceSubtitle")}</p>
            <VoiceDemo embedded />
          </article>
        </div>
      </div>
    </section>
  );
}
