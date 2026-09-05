import { getTranslations } from "next-intl/server";
import { FileText, Layers, MessagesSquare } from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { FeatureDisclosure } from "./feature-disclosure";

/** Three product surfaces, with secondary capabilities available on demand. */
export async function SectionWorkspace() {
  const t = await getTranslations("Landing");
  const cards = [
    {
      id: "tracker",
      icon: Layers,
      title: t("navMenu_tracker_title"),
      description: t("feature_board_body"),
      screenshot: "featureCycle",
      tone: "bg-[#eaf0e5] text-[#263c2c] dark:bg-[#222e25] dark:text-[#dce8dc]",
      points: (["board", "all", "inbox", "objectives", "cycles", "triage"] as const).map((key) => ({
        title: t(`feature_${key}_title`),
        body: t(`feature_${key}_body`),
      })),
    },
    {
      id: "pages",
      icon: FileText,
      title: t("pagesTitle"),
      description: t("pagesSubtitle"),
      screenshot: "pagesEditor",
      tone: "bg-[#f0ecf6] text-[#433352] dark:bg-[#2e2638] dark:text-[#e8dff2]",
      points: (["write", "link", "agents", "publish"] as const).map((key) => ({
        title: t(`pages_${key}_title`),
        body: t(`pages_${key}_body`),
      })),
    },
    {
      id: "feedback",
      icon: MessagesSquare,
      title: t("navMenu_feedback_title"),
      description: t("feedbackSubtitle"),
      screenshot: "feedbackBoard",
      tone: "bg-[#f7ecdf] text-[#573e28] dark:bg-[#342b22] dark:text-[#f1e1ce]",
      points: (["post", "moderate", "decide", "status"] as const).map((key) => ({
        title: t(`feedback_${key}_title`),
        body: t(`feedback_${key}_body`),
      })),
    },
  ] as const;

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="workspace-title">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 grid gap-5 border-t border-border pt-8 md:grid-cols-[1.2fr_1fr] md:gap-20">
          <h2 id="workspace-title" className="max-w-xl text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">
            {t("featuresTitle")}
          </h2>
          <p className="max-w-md self-end leading-relaxed text-muted-foreground">{t("featuresSubtitle")}</p>
        </header>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {cards.map((card, index) => (
            <article key={card.id} id={card.id} className={`min-w-0 scroll-mt-24 rounded-xl p-5 sm:p-6 ${card.tone}`}>
              <div className="mb-7 flex items-center justify-between">
                <card.icon className="size-5" strokeWidth={1.5} aria-hidden />
                <span className="font-mono text-[10px] opacity-65" aria-hidden>0{index + 1}</span>
              </div>
              <h3 className="text-xl font-medium tracking-tight">{card.title}</h3>
              <p className="mt-3 min-h-20 text-sm leading-relaxed opacity-80">{card.description}</p>
              <div className="my-6">
                <ScreenshotSlot id={card.screenshot} sizes="(min-width: 1024px) 336px, (min-width: 640px) calc(100vw - 96px), calc(100vw - 72px)" className="border-black/10 shadow-none dark:border-white/10" />
              </div>
              <FeatureDisclosure title={card.title}>
                <dl className="space-y-4">
                  {card.points.map((point) => (
                    <div key={point.title}>
                      <dt className="font-medium">{point.title}</dt>
                      <dd className="mt-1 opacity-80">{point.body}</dd>
                    </div>
                  ))}
                </dl>
              </FeatureDisclosure>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
