"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "mangue-ui";
import { useTranslations } from "next-intl";
import { AdminOverviewDashboard } from "./admin-overview-dashboard";
import { AdminUsersDashboard } from "./admin-users-dashboard";
import { AdminModelsDashboard } from "./admin-models-dashboard";
import { AdminCostsDashboard } from "./admin-costs-dashboard";

/**
 * Shell du `/admin` (MIN-90). Quatre onglets : « Vue d'ensemble » (l'app en
 * chiffres), « Utilisateurs » (LA vue des comptes, où vivent désormais toutes
 * les actions admin), « Coûts IA » et « Modèles ».
 *
 * Les onglets « Quotas » et « Facturation » ont disparu : ils n'étaient pas des
 * écrans mais des actions — remettre un budget à zéro, forcer un plan — et une
 * action se prend là où on regarde le compte concerné, pas dans un onglet qui
 * redemande son email. Le dashboard suit donc la même règle que le reste de
 * l'app : un onglet = un objet, pas un verbe.
 *
 * Onglets en style « line » horizontal, comme `pr-detail` ou le board de
 * feedback, et l'onglet courant vit dans l'URL (`?tab=`) — un lien vers
 * `/admin?tab=users` rouvre la bonne vue.
 *
 * Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx`.
 */

const TABS = ["overview", "users", "costs", "models"] as const;
type AdminTab = (typeof TABS)[number];

const DEFAULT_TAB: AdminTab = "overview";

export function AdminDashboard() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const active: AdminTab = (TABS as readonly string[]).includes(requested ?? "")
    ? (requested as AdminTab)
    : DEFAULT_TAB;

  const setActive = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", value);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Tabs value={active} onValueChange={setActive} className="w-full">
        <TabsList variant="line" className="mb-4 justify-start p-0">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="px-2.5">
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <AdminOverviewDashboard />
        </TabsContent>
        <TabsContent value="users">
          <AdminUsersDashboard />
        </TabsContent>
        <TabsContent value="costs">
          <AdminCostsDashboard />
        </TabsContent>
        <TabsContent value="models">
          <AdminModelsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
