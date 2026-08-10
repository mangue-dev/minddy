import { SettingsPageSkeleton } from "@/components/route-skeletons";

// Même gabarit que les réglages : un rail dans la sidebar secondaire, une
// colonne de cartes à droite. C'est le montage de la VRAIE barre par le
// squelette qui garde la sidebar primaire au rail pendant le chargement.
export default function AdminLoading() {
  return <SettingsPageSkeleton rows={4} />;
}
