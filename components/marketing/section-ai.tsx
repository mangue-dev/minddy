import { getTranslations } from "next-intl/server";
import { AiBrain01Icon, Mic01Icon } from "@hugeicons/core-free-icons";
import { ROUTINE_ICON, SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import { NumoFace } from "@/components/numo-face";
import { CARD_TONES } from "./card-tones";
import { FeatureChapter } from "./feature-chapter";
import { AiModels, DictationPill, NumoComposer, RoutineExcerpt, SmartAssignActivity, SmartFillProperties } from "./figures/card-figures";
import { SmartFillFlow } from "./figures/smart-fill-flow";

/**
 * The built-in AI: an issue typed in the composer, then filled and assigned
 * on its own, on a loop; then what minddy does without being asked, and Numo
 * when you ask.
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
          icon: AiBrain01Icon,
          title: t("ai_models_title"),
          body: t("ai_models_body"),
          shot: { node: <AiModels /> },
        },
      ]}
      aside={t("aiNote")}
    />
  );
}
