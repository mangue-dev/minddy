"use client";

import { useMemo } from "react";
import { Activity, DollarCircleIcon as CircleDollarSign, FileExportIcon, FlowIcon as Workflow, KeyRoundIcon as KeyRound, MessageSquareHeartIcon, Mic01Icon as Mic, PieChart, ReceiptText, Search01Icon, Sparkles, StarIcon, UserGroupIcon as Users, VectorSquareIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import type { AppIcon } from "@/components/icon";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  AI_MODEL_CONFIG_FIELDS,
  type AiConfigField,
  type AiConfigGroup,
} from "@/lib/ai-model-config";
import type { AdminTabId } from "@/lib/admin-tabs";

/** Stable section ids shared by search results and their DOM destinations. */
export const ADMIN_SECTIONS = {
  accountsSummary: "accounts-summary",
  accountsSupport: "accounts-support",
  costsSummary: "costs-summary",
  costsChart: "costs-chart",
  costsByFeature: "costs-by-feature",
  costsLogs: "costs-logs",
  modelsFile: "models-file",
  modelsRecommended: "models-recommended",
  modelsAssistant: "models-assistant",
  modelsAutomations: "models-automations",
  modelsEmbeddings: "models-embeddings",
  modelsVoice: "models-voice",
  modelsFeedback: "models-feedback",
  modelsByok: "models-byok",
} as const;

export type AdminSectionId =
  (typeof ADMIN_SECTIONS)[keyof typeof ADMIN_SECTIONS];

export const ADMIN_SECTION_PARAM = "section";

export function adminSectionAnchor(id: AdminSectionId): string {
  return `admin-section-${id}`;
}

export type AdminSection = {
  id: AdminSectionId;
  tab: AdminTabId;
  icon: AppIcon;
  title: string;
  tabLabel: string;
  keywords: string[];
};

type AdminKey = MessageKey<"Admin">;

const MODEL_GROUP_SECTIONS: Record<
  AiConfigGroup,
  { id: AdminSectionId; icon: AppIcon }
> = {
  assistant: { id: ADMIN_SECTIONS.modelsAssistant, icon: Sparkles },
  automations: { id: ADMIN_SECTIONS.modelsAutomations, icon: Workflow },
  embeddings: { id: ADMIN_SECTIONS.modelsEmbeddings, icon: VectorSquareIcon },
  voice: { id: ADMIN_SECTIONS.modelsVoice, icon: Mic },
  feedback: { id: ADMIN_SECTIONS.modelsFeedback, icon: MessageSquareHeartIcon },
  byok: { id: ADMIN_SECTIONS.modelsByok, icon: KeyRound },
};

/**
 * Administration search catalog in the current locale.
 *
 * Model rows remain grouped by their visible card, just like account/project
 * settings search: a query for “Reasoning level” returns the Assistant card.
 * Raw config keys stay in the keyword set so English technical terms remain
 * discoverable from every locale.
 */
export function useAdminSections(): AdminSection[] {
  const t = useTranslations("Admin");

  return useMemo(() => {
    const tabs: Record<AdminTabId, string> = {
      accounts: t("tabs.accounts"),
      costs: t("tabs.costs"),
      models: t("tabs.models"),
    };
    const section = (value: Omit<AdminSection, "tabLabel">): AdminSection => ({
      ...value,
      tabLabel: tabs[value.tab],
    });

    const fieldLabel = (field: AiConfigField): string => {
      const key = `fields.${field.key}.label` as AdminKey;
      return field.adminLabel ?? (t.has(key) ? t(key) : field.key);
    };
    const modelSections = (
      Object.keys(MODEL_GROUP_SECTIONS) as AiConfigGroup[]
    ).map((group) => {
      const meta = MODEL_GROUP_SECTIONS[group];
      const fields = AI_MODEL_CONFIG_FIELDS.filter(
        (field) => field.group === group && field.kind !== "recommended",
      );
      return section({
        id: meta.id,
        tab: "models",
        icon: meta.icon,
        title: t(`groups.${group}.title`),
        keywords: fields.flatMap((field) => [field.key, fieldLabel(field)]),
      });
    });

    return [
      section({
        id: ADMIN_SECTIONS.accountsSummary,
        tab: "accounts",
        icon: Users,
        title: t("accounts.countLabel"),
        keywords: ["accounts", "users", "count"],
      }),
      section({
        id: ADMIN_SECTIONS.accountsSupport,
        tab: "accounts",
        icon: Search01Icon,
        title: t("accounts.supportTitle"),
        keywords: [
          t("users.usageTitle"),
          t("billing.title"),
          t("quotas.reset"),
          "email",
          "quota",
          "budget",
          "gift plan",
          "usage",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.costsSummary,
        tab: "costs",
        icon: CircleDollarSign,
        title: t("costs.summaryTitle"),
        keywords: [t("costs.kpiSpend"), t("costs.kpiRequests"), t("costs.kpiTokens"), "cost", "spend", "month"],
      }),
      section({
        id: ADMIN_SECTIONS.costsChart,
        tab: "costs",
        icon: Activity,
        title: t("costs.spendByModelTitle"),
        keywords: [t("costs.topModelsTitle"), t("costs.requestsByModelTitle"), "chart", "daily", "model"],
      }),
      section({
        id: ADMIN_SECTIONS.costsByFeature,
        tab: "costs",
        icon: PieChart,
        title: t("costs.topFeaturesTitle"),
        keywords: [t("costs.spendByGroupTitle"), "feature", "cost", "usage"],
      }),
      section({
        id: ADMIN_SECTIONS.costsLogs,
        tab: "costs",
        icon: ReceiptText,
        title: t("costs.logsTitle"),
        keywords: ["log", "runs", "calls", "model", "tokens"],
      }),
      section({
        id: ADMIN_SECTIONS.modelsFile,
        tab: "models",
        icon: FileExportIcon,
        title: t("modelsFile.title"),
        keywords: [t("modelsFile.export"), t("modelsFile.import"), "export", "import", "json", "file"],
      }),
      section({
        id: ADMIN_SECTIONS.modelsRecommended,
        tab: "models",
        icon: StarIcon,
        title: t("fields.recommended_models.label"),
        keywords: ["recommended_models", "recommended", "picker"],
      }),
      ...modelSections,
    ];
  }, [t]);
}
