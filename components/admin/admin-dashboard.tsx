"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import {
  Bot,
  ChevronLeft,
  CircleDollarSign,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SidebarNavRail } from "@/components/sidebar-nav-rail";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { AdminOverviewDashboard } from "./admin-overview-dashboard";
import { AdminUsersDashboard } from "./admin-users-dashboard";
import { AdminModelsDashboard } from "./admin-models-dashboard";
import { AdminFinanceDashboard } from "./admin-finance-dashboard";

/**
 * Shell du `/admin` (MIN-90). Quatre onglets : « Vue d'ensemble » (l'app en
 * chiffres), « Utilisateurs » (LA vue des comptes, où vivent désormais toutes
 * les actions admin), « Finances » et « Modèles ».
 *
 * « Finances » (MIN-92) remplace l'ancien « Coûts IA », qui ne montrait qu'une
 * moitié de l'équation. Sa valeur d'onglet est un CONTRAT : c'est l'URL que
 * porte la notification push du garde-fou de dépense (`/admin?tab=finances`).
 *
 * Les onglets « Quotas » et « Facturation » ont disparu : ils n'étaient pas des
 * écrans mais des actions — remettre un budget à zéro, forcer un plan — et une
 * action se prend là où on regarde le compte concerné, pas dans un onglet qui
 * redemande son email. Le dashboard suit donc la même règle que le reste de
 * l'app : un onglet = un objet, pas un verbe.
 *
 * Le rail d'onglets est une SIDEBAR SECONDAIRE (MIN-262), et non plus une ligne
 * d'onglets posée au-dessus des cartes : la même colonne pleine hauteur, à la
 * même place et avec la même grammaire que le triage, les retours, les pull
 * requests, les sessions d'agent et les réglages. Le titre de l'écran est la
 * ligne de titre de cette barre ; il n'est donc plus écrit au-dessus du contenu,
 * où il faisait doublon avec le fil d'Ariane. Il n'y a pas de champ de filtre :
 * quatre entrées se lisent d'un coup d'œil.
 *
 * L'onglet courant vit dans l'URL (`?tab=`) — un lien vers `/admin?tab=users`
 * rouvre la bonne vue.
 *
 * Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx`.
 */

const TABS = ["overview", "users", "finances", "models"] as const;
type AdminTab = (typeof TABS)[number];

const DEFAULT_TAB: AdminTab = "overview";

const ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  finances: CircleDollarSign,
  models: Bot,
};

/** La colonne de contenu est plus large que celle des réglages (`max-w-3xl`) :
    les tableaux de finances et les grilles de compteurs y sont déjà à l'étroit. */
const ADMIN_MAX_WIDTH = "max-w-5xl";

export function AdminDashboard() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const contentFade = useScrollFade<HTMLDivElement>();

  const requested = searchParams.get("tab");
  const valid = (TABS as readonly string[]).includes(requested ?? "");
  const active: AdminTab = valid ? (requested as AdminTab) : DEFAULT_TAB;

  // Sous `md`, le rail et le contenu se relaient en plein écran, comme partout
  // ailleurs dans l'app. Une URL qui NOMME son onglet ouvre directement le
  // contenu : on arrive de la palette, d'un lien ou d'une notification push.
  const [mobileDetail, setMobileDetail] = useState(valid);

  const items = useMemo(
    () => TABS.map((tab) => ({ value: tab, label: t(`tabs.${tab}`), icon: ICONS[tab] })),
    [t],
  );

  const setActive = useCallback(
    (value: string) => {
      setMobileDetail(true);
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", value);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    // La RANGÉE de l'écran : le rail part dans la sidebar secondaire (par
    // portail, dans le châssis) et le contenu reste à droite.
    <div className="flex h-full min-h-0">
      <SecondarySidebar title={t("pageTitle")} hiddenOnMobile={mobileDetail}>
        {/* Des cartes à nous, et non les `Tabs` de mangue-ui : la sélection est
            dessinée par une pastille qui GLISSE, que l'indicateur de la
            bibliothèque doublait d'une capsule bordée. Cf. SidebarNavRail. */}
        <SidebarNavRail
          label={t("pageTitle")}
          items={items}
          value={active}
          onValueChange={setActive}
        />
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {/* En-tête du panneau, MOBILE seulement : le retour vers le rail et le
            nom de l'onglet ouvert. Sur desktop le rail est à l'écran et le
            surligne déjà. */}
        <div className="flex shrink-0 items-center gap-2 px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tCommon("back")}
            onClick={() => setMobileDetail(false)}
          >
            <ChevronLeft />
          </Button>
          <span className="truncate text-sm font-medium">
            {t(`tabs.${active}`)}
          </span>
        </div>

        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8 md:px-6 md:pt-6"
        >
          <div className={cn("mx-auto flex flex-col gap-4", ADMIN_MAX_WIDTH)}>
            {/* Seul le panneau ouvert est monté — c'est déjà ce que faisait
                `TabsContent`, qui démonte les autres : chacun d'eux part
                chercher ses chiffres au montage, et les quatre à la fois
                réveilleraient tout le tableau de bord pour n'en montrer qu'un
                quart. */}
            {active === "overview" && <AdminOverviewDashboard />}
            {active === "users" && <AdminUsersDashboard />}
            {active === "finances" && <AdminFinanceDashboard />}
            {active === "models" && <AdminModelsDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}
