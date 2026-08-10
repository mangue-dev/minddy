"use client";

import { useCallback, useId, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  cn,
} from "mangue-ui";
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
  const reduceMotion = useReducedMotion();
  // `layoutId` est GLOBAL à framer-motion : deux rails montés en même temps
  // (une transition de route qui superpose deux écrans) se voleraient la
  // pastille. Un id par instance ferme la porte.
  const pillId = `admin-tab-pill-${useId()}`;
  const contentFade = useScrollFade<HTMLDivElement>();

  const requested = searchParams.get("tab");
  const valid = (TABS as readonly string[]).includes(requested ?? "");
  const active: AdminTab = valid ? (requested as AdminTab) : DEFAULT_TAB;

  // Sous `md`, le rail et le contenu se relaient en plein écran, comme partout
  // ailleurs dans l'app. Une URL qui NOMME son onglet ouvre directement le
  // contenu : on arrive de la palette, d'un lien ou d'une notification push.
  const [mobileDetail, setMobileDetail] = useState(valid);

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
    // La racine des Tabs est la RANGÉE de l'écran : le rail part dans la sidebar
    // secondaire (par portail, donc toujours sous ce `Tabs` côté React — le
    // contexte Radix passe, les flèches du clavier aussi) et le contenu reste à
    // droite.
    <Tabs
      orientation="vertical"
      value={active}
      onValueChange={setActive}
      className="flex h-full min-h-0 gap-0"
    >
      <SecondarySidebar title={t("pageTitle")} hiddenOnMobile={mobileDetail}>
        {/* `flex-col` EN CLAIR, et pas via l'orientation des Tabs : mangue-ui
            empile la liste avec `group-data-vertical/tabs:flex-col`, un
            sélecteur de DESCENDANCE. Or le portail sort cette liste du DOM du
            `<Tabs>` — le contexte React la suit, la variante CSS non, et les
            onglets repartaient en ligne. Même raison pour le `w-full
            justify-start` posé sur chaque onglet plus bas. */}
        <TabsList className="h-auto w-full flex-col items-stretch gap-1 rounded-none bg-transparent p-0 px-2 pt-2 pb-4">
          {TABS.map((tab) => {
            const Icon = ICONS[tab];
            const isActive = tab === active;
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                /* La pastille de l'onglet actif est dessinée ICI (voir plus bas),
                   pas par `data-active:bg-*` : une classe ne peut pas glisser
                   d'un onglet à l'autre, un élément partagé si. */
                className={cn(
                  "w-full justify-start gap-2 rounded-lg px-3 py-2.5",
                  "data-active:bg-transparent dark:data-active:bg-transparent",
                  "dark:data-active:border-transparent",
                  "group-data-[variant=default]/tabs-list:data-active:shadow-none",
                )}
              >
                {/* `layoutId` : une seule pastille montée à la fois, que
                    framer-motion fait GLISSER vers le nouvel onglet au lieu de
                    la faire disparaître ici et réapparaître là. */}
                {isActive && (
                  <motion.span
                    layoutId={pillId}
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-muted"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 40 }
                    }
                  />
                )}
                {/* Positionné, donc peint AU-DESSUS de la pastille (même pile,
                    ordre du DOM) : sans ce span, l'absolu passerait par-dessus
                    le libellé, qui n'est pas positionné. */}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(`tabs.${tab}`)}</span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
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
            <TabsContent value="overview" className="mt-0">
              <AdminOverviewDashboard />
            </TabsContent>
            <TabsContent value="users" className="mt-0">
              <AdminUsersDashboard />
            </TabsContent>
            <TabsContent value="finances" className="mt-0">
              <AdminFinanceDashboard />
            </TabsContent>
            <TabsContent value="models" className="mt-0">
              <AdminModelsDashboard />
            </TabsContent>
          </div>
        </div>
      </div>
    </Tabs>
  );
}
