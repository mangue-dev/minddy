"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { useZenMode } from "@/lib/zen-mode-context";
import { useOnboarding } from "@/lib/use-onboarding";
import { displayName } from "@/lib/display-name";
import { pickGreeting } from "@/lib/home-greeting";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";
import { HomeSmartAssignWarning } from "@/components/home/home-smart-assign-warning";
import { HomeProjectSignals } from "@/components/home/home-project-signals";
import { HomeNumoComposer } from "@/components/home/home-numo-composer";
import { OnboardingCard } from "@/components/home/onboarding-card";
import { DesktopInstallBanner } from "@/components/home/desktop-install-banner";

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

    Desktop seulement : en dessous, le shell réserve déjà de quoi dégager la barre
    de navigation flottante (`--mobile-nav-clearance`, globals.css), et cette
    réserve remonte le bloc plus que le header ne l'avait descendu. */
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
  const { user } = useAuth();
  // Mode zen (MIN-134) : sans header, la zone de contenu EST la fenêtre — le
  // décalage qui les sépare n'a plus lieu d'être.
  const { zen } = useZenMode();
  // Onboarding (MIN-74) : tant qu'il n'est pas terminé ni passé, il prend la
  // place du bloc d'accueil — un compte neuf n'a rien à demander à Numo avant
  // d'avoir un projet.
  const onboarding = useOnboarding();

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
   * La page tient en UN écran, et rien en dessous. Il y avait là une colonne de
   * files — en attente, échéances, à trier, le cycle, le carnet : un tableau de
   * bord sous la ligne de flottaison, qui redisait ce que la sidebar, le board
   * global et le carnet montrent déjà en entier, chacun chez lui. L'accueil ne
   * garde donc que ce qu'on vient y chercher : à qui l'on parle (le salut), par
   * où on lui parle (le composer), et ce qui attend une réponse de moi seul (une
   * invitation, l'avis de Smart Assign).
   */
  return onboarding.showCard ? (
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
     * libre à parts égales, ce qui pose le COMPOSER au centre exact, et non le
     * bloc entier : c'est lui qu'on vient chercher, le salut se lit au-dessus.
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
          composer au centre de la fenêtre quoi qu'ils portent.

          L'ordre est celui de l'urgence : quelqu'un qui m'attend, puis un
          réglage qui trie mal, puis ce qui s'est empilé dans mes projets. Ces
          dernières lignes sont là presque tout le temps, les deux premières
          presque jamais — les mettre en dernier, c'est laisser la place du
          dessus à ce qui, quand il paraît, mérite d'être lu en premier. */}
      <div className={cn(HERO_COLUMN, "flex flex-col gap-3 pb-10 pt-3")}>
        <PendingInvitationsBanner />
        <HomeSmartAssignWarning />
        {/* Rien pendant l'onboarding : cette branche ne s'affiche pas tant que
            la carte est là, et c'est tout ce qu'il faut — un compte qui monte
            son premier projet n'a pas à s'entendre dire ce qu'il y a à trier
            dedans. */}
        <HomeProjectSignals />
        {/* EN DERNIER, et pour la même raison d'urgence que l'ordre ci-dessus :
            c'est la seule ligne du bloc qui n'attend aucune réponse. Elle est
            aussi la seule à ne paraître qu'une fois dans la vie du compte — et
            elle ne paraît pas du tout pendant l'onboarding, cette branche ne
            s'affichant qu'après (MIN-292). */}
        <DesktopInstallBanner />
      </div>
    </section>
  );
}
