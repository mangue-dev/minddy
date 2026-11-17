import { getTranslations } from "next-intl/server";
import { AiBrain01Icon, CalendarClockIcon, CpuIcon, Mic01Icon, Moon02Icon } from "@hugeicons/core-free-icons";
import { ROUTINE_ICON, SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import { NumoFace } from "@/components/numo-face";
import { CARD_TONES } from "./card-tones";
import { FeatureChapter } from "./feature-chapter";
import {
  AiModels,
  DictationPill,
  NumoAwaySummary,
  NumoComposer,
  NumoMemory,
  NumoReminder,
  RoutineExcerpt,
  SmartAssignActivity,
  SmartFillProperties,
} from "./figures/card-figures";
import { SmartFillFlow } from "./figures/smart-fill-flow";

/**
 * The built-in AI: an issue typed in the composer, then filled and assigned
 * on its own, on a loop; then Numo, the one assistant: what you ask it, what
 * it remembers, what it does while you are away, and the work it schedules.
 */
export async function SectionAi() {
  const t = await getTranslations("Landing");
  return (
    <FeatureChapter
      id="ai"
      eyebrow={t("aiEyebrow")}
      title={t("aiTitle")}
      lede={t("aiLede")}
      figureClassName={CARD_TONES.mint}
      figure={<SmartFillFlow />}
      tone="mint"
      points={[
        {
          icon: SMART_FILL_ICON,
          title: t("ai_fill_title"),
          body: t("ai_fill_body"),
          anchor: "smart",
          shot: { node: <SmartFillProperties /> },
        },
        {
          icon: SMART_ASSIGN_ICON,
          title: t("ai_assign_title"),
          body: t("ai_assign_body"),
          shot: { node: <SmartAssignActivity /> },
        },
        {
          icon: NumoFace,
          title: t("ai_numo_title"),
          body: t("ai_numo_body"),
          anchor: "numo",
          shot: { node: <NumoComposer /> },
        },
        {
          icon: AiBrain01Icon,
          title: t("ai_memory_title"),
          body: t("ai_memory_body"),
          anchor: "memory",
          shot: { node: <NumoMemory /> },
        },
        {
          icon: Moon02Icon,
          title: t("ai_background_title"),
          body: t("ai_background_body"),
          anchor: "background",
          shot: { node: <NumoAwaySummary /> },
        },
        {
          icon: CalendarClockIcon,
          title: t("ai_reminders_title"),
          body: t("ai_reminders_body"),
          anchor: "reminders",
          shot: { node: <NumoReminder /> },
        },
        {
          icon: ROUTINE_ICON,
          title: t("ai_routines_title"),
          body: t("ai_routines_body"),
          anchor: "routines",
          shot: { node: <RoutineExcerpt /> },
        },
        {
          icon: Mic01Icon,
          title: t("ai_voice_title"),
          body: t("ai_voice_body"),
          anchor: "voice",
          shot: { node: <DictationPill /> },
        },
        {
          icon: CpuIcon,
          title: t("ai_models_title"),
          body: t("ai_models_body"),
          shot: { node: <AiModels /> },
        },
      ]}
      aside={t("aiNote")}
    />
  );
}
