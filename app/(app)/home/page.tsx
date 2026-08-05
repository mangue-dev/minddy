"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton, cn } from "mangue-ui";
import { FolderPlus, LayoutGrid, Plus } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { useZenMode } from "@/lib/zen-mode-context";
import { useOnboarding } from "@/lib/use-onboarding";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { HomeCycleSection } from "@/components/home/home-cycle-section";
import { HomeWaitingSection } from "@/components/home/home-waiting-section";
import { HomeDueSoonSection } from "@/components/home/home-due-soon-section";
import { HomeScratchpadSection } from "@/components/home/home-scratchpad-section";
import { HomeTriageSection } from "@/components/home/home-triage-section";
import { OnboardingCard } from "@/components/home/onboarding-card";
import { EmptyScene } from "@/components/empty-scene";

/** Display name from Supabase auth metadata (display_name → full_name → name),
    never the raw email — mirrors the sidebar account button. */
type AuthMeta = { display_name?: string; full_name?: string; name?: string };

/** La colonne du bloc d'accueil : bien plus étroite que la page. Le composer est
    une phrase qu'on tape, pas un tableau — étalé sur toute la largeur du contenu,
    il perdait son centre de gravité et le salut flottait au-dessus de rien. */
const HERO_COLUMN = "mx-auto w-full max-w-xl";

/** Hauteur du header du shell (`<Header/>` de mangue-ui, `h-[60px]`). La zone de
    contenu commence sous lui : ce qu'on y centre tombe 30 px trop bas par rapport
    à la FENÊTRE. Une gouttière basse de cette hauteur remonte le bloc d'exactement
    la moitié — c'est tout ce qui sépare les deux centres.

    Desktop seulement : en dessous, le shell réserve déjà 6 rem au bas du contenu
    pour que rien ne passe sous la barre de navigation flottante, et cette réserve
    remonte le bloc plus que le header ne l'avait descendu. */
const HEADER_OFFSET = "desktop:pb-[60px]";

/**
 * Le titre de l'accueil : « Bonjour » à la première visite, autre chose aux
 * suivantes. Le vivier dépend de l'heure LOCALE et du jour (lib/home-greeting.ts),
 * deux choses que le rendu serveur ne connaît pas — il est en UTC, et le tirage
 * au sort donnerait de toute façon deux phrases différentes de part et d'autre
 * de l'hydratation. La graine ne se pose donc qu'au montage : jusque-là le titre
 * reste le « Bonjour » neutre, qui est aussi ce que le serveur a rendu.
 *
 * Une seule graine pour toute la vie de la page : la phrase ne doit pas changer
 * sous les yeux parce que le nom vient d'arriver ou qu'un cache s'est rafraîchi.
 */
function useGreeting(name: string): string {
  const t = useTranslations("Home");
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  if (seed === null) return name ? t("greeting", { name }) : t("greetingNoName");
  const variant = pickGreeting(new Date(), seed);
  return t(name ? variant.key : variant.keyNoName, { name });
}

export default function HomePage() {
  const t = useTranslations("Home");
  const tBoard = useTranslations("Board");
  const tProjects = useTranslations("Projects");
  const { projects, openCreateProject } = useProjects();
  const { user } = useAuth();
  // Mode zen (MIN-134) : sans header, la zone de contenu EST la fenêtre — le
  // décalage qui les sépare n'a plus lieu d'être.
  const { zen } = useZenMode();
  // Onboarding (MIN-74) : tant qu'il n'est pas terminé ni passé, il prend la
  // place du corps de la home — pour un compte neuf, cycle, échéances, carnet et
  // file de triage n'ont rien à montrer.
  const onboarding = useOnboarding();
  // Le compteur de tickets vient du MÊME appel que l'onboarding (/api/me/summary,
  // dédoublonné par react-query) : rien de plus sur le réseau pour savoir si le
  // compte a déjà écrit quelque chose.
  const { counts } = useHomeSummaryQuery();

  const meta = user?.user_metadata as AuthMeta | undefined;
  // Repli vide : sans nom ni e-mail, on salue sans prénom plutôt que d'injecter
  // un mot bouche-trou dans la phrase.
  const name = displayName(
    {
      full_name: meta?.display_name || meta?.full_name || meta?.name || null,
      email: user?.email ?? null,
    },
    "",
  );

  const greeting = useGreeting(name);
  /**
   * Deux vides, une fois l'onboarding terminé ou passé : pas de projet, ou des
   * projets sans le moindre ticket. Dans les deux cas la page garde son salut et
   * son composer, et le corps dit ce qui manque plutôt que d'aligner des cartes
   * à zéro. Aucun ticket ⇒ rien en cycle, rien en attente : c'est le même vide,
   * et il se lit sur un seul compteur.
   */
  const settled = !onboarding.loading && !onboarding.showCard;
  const noProject = settled && projects.length === 0;
  const noIssue = settled && projects.length > 0 && counts.total === 0;

  return (
    <>
      {onboarding.showCard ? (
        /**
         * L'onboarding, lui, se centre dans la ZONE DE CONTENU : c'est une carte
         * à lire de haut en bas, pas une invite à taper, et elle garde donc le
         * décalage du header plutôt que de remonter de trente pixels. Le salut
         * accueille au lieu de dire bonjour (c'est une première visite), reste au
         * bord gauche comme la carte, et le composer garde la largeur de la
         * colonne — l'étroitesse est le geste du bloc d'accueil, pas celui-ci.
         */
        <section className="flex min-h-full flex-col justify-center px-6 py-10">
          <div className="mx-auto w-full max-w-5xl">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {name ? t("welcome", { name }) : t("welcomeNoName")}
            </h1>
            {/* Le nombre d'étapes vient de l'état, pas de la traduction : il était
                écrit en toutes lettres (« Quatre étapes ») et démentait
                l'indicateur « Étape 4 sur 5 » de la carte juste en dessous dès
                qu'une étape s'ajoutait (MIN-149). */}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("onboardingSubtitle", { n: onboarding.totalCount })}
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <HomeNumoComposer />
              <PendingInvitationsBanner />
              <HomeSmartAssignWarning />
            </div>

            <div className="mt-6">
              <OnboardingCard onboarding={onboarding} />
            </div>
          </div>
        </section>
      ) : (
        /**
         * Le bloc d'accueil hors onboarding : le salut, le composer, puis ce qui
         * attend une réponse (les invitations, l'avis de Smart Assign). Trois
         * rangées `1fr / auto / 1fr` — les deux extrêmes se partagent l'espace
         * libre à parts égales, ce qui pose le COMPOSER au centre exact, et non
         * le bloc entier : c'est lui qu'on vient chercher, le salut se lit
         * au-dessus. Il occupe au moins toute la hauteur visible, donc le reste de
         * la page commence sous la ligne de flottaison.
         *
         * `min-h-full` et pas `100dvh` : la hauteur de référence est celle du
         * <main> du shell, qui n'est la fenêtre entière ni sous le header, ni sur
         * ultrawide où l'application devient une carte bornée.
         */
        <section
          className={cn(
            "grid min-h-full grid-rows-[1fr_auto_1fr] px-6",
            !zen && HEADER_OFFSET,
          )}
        >
          <div className={cn(HERO_COLUMN, "flex items-end pb-5 pt-10")}>
            <h1 className="w-full text-center font-display text-2xl font-semibold tracking-tight">
              {greeting}
            </h1>
          </div>

          {/* "Ask Numo" composer — hands off to the global assistant panel. */}
          <div className={HERO_COLUMN}>
            <HomeNumoComposer />
          </div>

          {/* Sous l'input, et pas en tête de page : une invitation à un projet
              est une réponse à donner, pas un bandeau à repousser du regard pour
              atteindre le salut. Même place pour l'avis de Smart Assign — et les
              garder dans le bloc, plutôt qu'au-dessus, est aussi ce qui laisse le
              composer au centre de la fenêtre quoi qu'ils portent. */}
          <div className={cn(HERO_COLUMN, "flex flex-col gap-3 pb-10 pt-3")}>
            <PendingInvitationsBanner />
            <HomeSmartAssignWarning />
          </div>
        </section>
      )}

      {/* Nothing below the composer until the signals are in: `visible` would
          default to true (0 project, 0 issue) and flash the onboarding on a
          long-standing account's home. */}
      {onboarding.loading ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2.5 px-6 pb-10">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : onboarding.showCard ? null : (
        /**
         * Le corps est UNE colonne de sections, jamais une grille : deux cartes
         * côte à côte coupaient les titres de tickets au tiers et se
         * ressemblaient trait pour trait alors qu'elles ne disaient pas la même
         * chose. Toutes partagent la grammaire de components/home/home-list.tsx.
         *
         * L'ordre est celui de ce que chacune DEMANDE : ce qui est arrêté en
         * attendant un humain, puis ce qui périme, puis ce qui attend une
         * décision, puis le plan de la quinzaine, puis mes notes. Les quatre
         * premières s'effacent quand elles sont vides (`gap` ignore les enfants
         * nuls) — c'est donc un ordre de priorité, pas une maquette figée : sur
         * un compte calme, « À trier » se retrouve tout en haut.
         */
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-10">
          {/* Sans projet, ou sans le moindre ticket, les files n'ont rien à
              lister : la scène prend leur place et dit lequel des deux vides on
              regarde, comme sur le board global. Le geste qui débloque le premier
              vide vit avec lui, sous la scène : le bloc d'accueil, lui, ne porte
              plus rien d'autre que le salut et le composer. Le carnet ne dépend
              d'aucun ticket : il reste en dessous. */}
          {noProject || noIssue ? (
            <EmptyScene
              icon={noProject ? FolderPlus : LayoutGrid}
              title={noProject ? t("noProject") : tBoard("emptyTitle")}
            >
              {noProject ? (
                <Button onClick={openCreateProject}>
                  <Plus className="size-4" />
                  {tProjects("firstProject")}
                </Button>
              ) : null}
            </EmptyScene>
          ) : (
            <>
              <HomeWaitingSection />
              <HomeDueSoonSection />
              <HomeTriageSection />
              <HomeCycleSection />
            </>
          )}

          {/* Le carnet de tâches, en clair : personnel et cross-projet comme
              cette page. Carnet vide → rien du tout. */}
          <HomeScratchpadSection />

          {/* Plus de grille de projets ici : la sidebar les liste tous, en
              permanence et sur toutes les pages, « Nouveau projet » compris. La
              même chose une deuxième fois, deux écrans plus bas, poussait le
              travail du jour hors de vue pour un lanceur qu'on n'utilisait pas. */}
        </div>
      )}
    </>
  );
}
