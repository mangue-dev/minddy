"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "mangue-ui";
import { useTranslations } from "next-intl";
import { AdminModelsDashboard } from "./admin-models-dashboard";
import { AdminCostsDashboard } from "./admin-costs-dashboard";
import { AdminQuotasDashboard } from "./admin-quotas-dashboard";

/**
 * Shell à onglets du `/admin` : « Modèles » (config des modèles IA), « Coûts IA »
 * (suivi des coûts LLM) et « Quotas » (limites d'usage de l'agent : plafond global
 * + remise à zéro par utilisateur). Chaque onglet monte son propre dashboard
 * autonome. Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx`.
 */
export function AdminDashboard() {
  const t = useTranslations("Admin");
  return (
    <Tabs defaultValue="models" className="w-full">
      <div className="mx-auto flex w-full max-w-[880px] px-4 pt-4 md:px-8 md:pt-8">
        <TabsList>
          <TabsTrigger value="models">{t("tabs.models")}</TabsTrigger>
          <TabsTrigger value="costs">{t("tabs.costs")}</TabsTrigger>
          <TabsTrigger value="quotas">{t("tabs.quotas")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="models">
        <AdminModelsDashboard />
      </TabsContent>
      <TabsContent value="costs">
        <AdminCostsDashboard />
      </TabsContent>
      <TabsContent value="quotas">
        <AdminQuotasDashboard />
      </TabsContent>
    </Tabs>
  );
}
