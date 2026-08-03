"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BriefPreview } from "@/components/project-seed/brief-preview";
import { useSeedProposal } from "@/lib/use-seed-proposal";
import type { SeedProposal } from "@/lib/seed/types";

/**
 * La proposition d'amorce, dans le fil de Numo (MIN-173).
 *
 * Numo n'écrit pas vingt tickets un par un : il appelle la passe du brief
 * (`propose_backlog`) avec ce que la conversation a établi, et rend la main.
 * Ce qui revient est une PROPOSITION — les mêmes objectifs, les mêmes tickets,
 * le même aperçu que la modale du board (`components/project-seed/`), à la
 * largeur du panneau. Rien n'existe tant que le bouton n'a pas été cliqué.
 *
 * La carte ne VIT que sur la dernière proposition du fil (`live`) : une fois
 * les tickets créés, la conversation reprend et la ligne d'outil suffit à dire
 * ce qui s'est passé.
 */
export function SeedProposalCard({
  projectId,
  proposal,
  onCreated,
}: {
  /** Le projet visé, tel que le tool result le porte — la portée du panneau
   *  peut avoir bougé depuis (navigation), la proposition non. */
  projectId: string;
  proposal: SeedProposal;
  /** Les tickets sont écrits : le compte part dire à Numo ce qui existe. */
  onCreated: (created: number) => void;
}) {
  const t = useTranslations("Seed");
  const seed = useSeedProposal(projectId);
  const { setProposal } = seed;
  // Écrit une fois, la carte se fige sur place : elle disparaît au rendu
  // suivant (le fil repart), et d'ici là le bouton ne doit plus rien pouvoir
  // écrire — un second clic créerait le lot deux fois.
  const [done, setDone] = useState(false);

  // La proposition vient du résultat d'outil ; l'aperçu en garde sa copie
  // vivante (décochages, titres réécrits) le temps de la relecture.
  useEffect(() => {
    setProposal(proposal);
  }, [proposal, setProposal]);

  if (!seed.proposal) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
      <p className="mb-2 text-xs text-muted-foreground">{t("previewDesc")}</p>
      <BriefPreview
        proposal={seed.proposal}
        excluded={seed.excluded}
        onToggle={seed.toggle}
        onRename={seed.rename}
        creating={seed.creating || done}
        onCreate={() => {
          void seed.create().then((result) => {
            if (!result) return;
            setDone(true);
            onCreated(result.created);
          });
        }}
        // Le fil défile déjà : l'aperçu ne prend pas plus que la moitié de la
        // hauteur du panneau, et fait défiler sa liste dedans.
        className="max-h-[50vh]"
      />
    </div>
  );
}
