"use client";

import { useMemo } from "react";
import { Activity, BotIcon as Bot, DollarCircleIcon as CircleDollarSign, FlowIcon as Workflow, GaugeIcon, Globe, KeyRoundIcon as KeyRound, LayoutDashboardIcon, MessageSquareHeartIcon, Mic01Icon as Mic, PieChart, ReceiptText, Rocket, Sparkles, UserGroupIcon as Users, WalletCards } from "@hugeicons/core-free-icons";
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
  overviewSummary: "overview-summary",
  overviewActivity: "overview-activity",
  overviewOnboarding: "overview-onboarding",
  overviewPlans: "overview-plans",
  overviewContent: "overview-content",
  usersAccounts: "users-accounts",
  financeSummary: "finance-summary",
  financeChart: "finance-chart",
  financeCap: "finance-cap",
  financeByType: "finance-by-type",
  financeLogs: "finance-logs",
  modelsAssistant: "models-assistant",
  modelsAutomations: "models-automations",
  modelsAgent: "models-agent",
  modelsByok: "models-byok",
  modelsVoice: "models-voice",
  modelsFeedback: "models-feedback",
  modelsSite: "models-site",
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
  agent: { id: ADMIN_SECTIONS.modelsAgent, icon: Bot },
  byok: { id: ADMIN_SECTIONS.modelsByok, icon: KeyRound },
  voice: { id: ADMIN_SECTIONS.modelsVoice, icon: Mic },
  feedback: { id: ADMIN_SECTIONS.modelsFeedback, icon: MessageSquareHeartIcon },
  site: { id: ADMIN_SECTIONS.modelsSite, icon: Globe },
};

/**
 * Administration search catalog in the current locale.
 *
 * Model rows remain grouped by their visible card, just like account/project
 * settings search: a query for “Reasoning level” returns the Assistant card.
 * Raw config keys stay in the keyword set so English technical terms remain
 * discoverable from the French interface as well.
 */
export function useAdminSections(): AdminSection[] {
  const t = useTranslations("Admin");

  return useMemo(() => {
    const tabs: Record<AdminTabId, string> = {
      overview: t("tabs.overview"),
      users: t("tabs.users"),
      finances: t("tabs.finances"),
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
        (field) => field.group === group,
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
        id: ADMIN_SECTIONS.overviewSummary,
        tab: "overview",
        icon: LayoutDashboardIcon,
        title: t("overview.summary"),
        keywords: [
          t("overview.totalUsers"),
          t("overview.activeWeek"),
          t("overview.activeToday"),
          "accounts",
          "comptes",
          "users",
          "utilisateurs",
          "active",
          "actifs",
          "sign-ups",
          "inscriptions",
          "summary",
          "synthèse",
          "synthese",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.overviewActivity,
        tab: "overview",
        icon: Activity,
        title: t("overview.activity"),
        keywords: [
          t("overview.activeDaily"),
          t("overview.signupsDaily"),
          "activity",
          "activité",
          "activite",
          "daily",
          "jour",
          "30 days",
          "30 jours",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.overviewOnboarding,
        tab: "overview",
        icon: Rocket,
        title: t("overview.onboarding"),
        keywords: [
          t("overview.onboardingStarted"),
          t("overview.onboardingCompleted"),
          t("overview.onboardingDismissed"),
          "onboarding",
          "started",
          "completed",
          "dismissed",
          "présenté",
          "termine",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.overviewPlans,
        tab: "overview",
        icon: WalletCards,
        title: t("overview.plans"),
        keywords: [
          "plans",
          "offres",
          "subscriptions",
          "abonnements",
          "stripe",
          "override",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.overviewContent,
        tab: "overview",
        icon: PieChart,
        title: t("overview.content"),
        keywords: [
          t("overview.totalProjects"),
          t("overview.totalIssues"),
          "content",
          "contenu",
          "projects",
          "projets",
          "issues",
          "tickets",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.usersAccounts,
        tab: "users",
        icon: Users,
        title: t("users.title"),
        keywords: [
          t("users.accountTitle"),
          t("users.usageTitle"),
          t("users.internalTitle"),
          t("billing.title"),
          "accounts",
          "comptes",
          "email",
          "quota",
          "budget",
          "gift plan",
          "offrir un plan",
          "internal",
          "interne",
          "usage",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.financeSummary,
        tab: "finances",
        icon: CircleDollarSign,
        title: t("finance.summary"),
        keywords: [
          t("finance.netCollected"),
          t("finance.mrr"),
          t("finance.monthCost"),
          t("finance.margin"),
          "revenue",
          "revenu",
          "income",
          "entrées",
          "cost",
          "coût",
          "margin",
          "marge",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.financeChart,
        tab: "finances",
        icon: Activity,
        title: t("finance.chartTitle"),
        keywords: [
          "chart",
          "graphique",
          "income",
          "entrées",
          "costs",
          "coûts",
          "daily",
          "jour",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.financeCap,
        tab: "finances",
        icon: GaugeIcon,
        title: t("finance.capTitle"),
        keywords: [
          "openrouter",
          "cap",
          "plafond",
          "limit",
          "limite",
          "remaining",
          "restant",
          "reset",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.financeByType,
        tab: "finances",
        icon: PieChart,
        title: t("finance.byType"),
        keywords: [
          "feature",
          "fonctionnalité",
          "fonctionnalite",
          "cost",
          "coût",
          "usage",
          "tokens",
        ],
      }),
      section({
        id: ADMIN_SECTIONS.financeLogs,
        tab: "finances",
        icon: ReceiptText,
        title: t("finance.logs"),
        keywords: [
          "log",
          "journal",
          "runs",
          "calls",
          "appels",
          "model",
          "modèle",
          "tokens",
        ],
      }),
      ...modelSections,
    ];
  }, [t]);
}
