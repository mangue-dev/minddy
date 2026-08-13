"use client";

import {
  AppWindowMac,
  BellRing,
  CalendarRange,
  Command,
  Crosshair,
  FileText,
  Inbox,
  Layers,
  LayoutList,
  Link2,
  ListFilter,
  MessagesSquare,
  Mic,
  PencilLine,
  Plug2,
  RefreshCw,
  Search,
  Target,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { IsoIcon, isoGlyph } from "@/components/illustrations/iso-icon";

/**
 * Les icônes de la landing, dans l'isométrie de l'application (MIN-254).
 *
 * La page posait partout la même pastille : un carré arrondi gris avec une
 * icône lucide dedans, répétée d'une section à l'autre. C'est le dessin le plus
 * neutre possible — donc celui qui ne dit rien de minddy. Les états vides de
 * l'app, eux, ont un style : une icône COUCHÉE dans le plan isométrique, avec
 * son épaisseur (`components/illustrations/iso-icon.tsx`). Le reprendre ici
 * fait que la landing et le produit se ressemblent enfin.
 *
 * POURQUOI UN REGISTRE DE NOMS et pas une prop `icon`. `IsoIcon` est un
 * composant client (il MESURE le tracé rendu pour l'inscrire dans le losange) et
 * les sections de la landing sont des Server Components. Un composant React ne
 * se sérialise pas : passer `icon={Inbox}` depuis le serveur ne compile pas.
 * L'appelant passe donc un nom, et la résolution se fait ici, côté client.
 *
 * Le terrain en pointillés (`IsoIconScene`) n'est PAS repris : il illustre un
 * vide à remplir, ce qui n'a aucun sens dans une carte de fonctionnalité. Seule
 * l'icône est couchée.
 */

const ICONS = {
  api: Plug2,
  bell: BellRing,
  command: Command,
  context: Crosshair,
  cycles: CalendarRange,
  find: Search,
  import: Upload,
  inbox: Inbox,
  layers: Layers,
  list: LayoutList,
  message: MessagesSquare,
  mic: Mic,
  objectives: Target,
  pages: FileText,
  pencil: PencilLine,
  refresh: RefreshCw,
  share: Link2,
  triage: ListFilter,
  window: AppWindowMac,
} as const satisfies Record<string, LucideIcon>;

export type IsoTileName = keyof typeof ICONS;

/**
 * La boîte de l'icône couchée. Deux constantes de géométrie, et elles ne sont
 * pas décoratives :
 *
 *  - le RAPPORT 2:1, celui de l'isométrie. Une icône couchée occupe un losange
 *    deux fois plus large que haut ; lui réserver un carré laisserait deux
 *    bandes vides au-dessus et au-dessous, que chaque appelant rattraperait à sa
 *    façon avec une marge négative ;
 *  - les 70 % de LARGEUR donnés au tracé. Un carré tourné de 45° a pour largeur
 *    sa diagonale, soit son côté fois √2 : à 70,7 %, le losange touche
 *    exactement les bords de la boîte. Au-delà, le dessin déborde sur ce qui
 *    l'entoure — c'est ce que fait `IsoIcon` seul, dont la boîte décrit l'icône
 *    AVANT sa mise à plat.
 *
 * L'appelant ne donne donc qu'une largeur (`w-14`), et le reste suit.
 */
function IsoBox({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn("relative inline-flex w-12 items-center justify-center", className)}
      style={{ aspectRatio: "2 / 1" }}
    >
      {children}
    </span>
  );
}

/**
 * L'icône couchée, sans cadre autour.
 *
 * `depth` donne l'épaisseur : des copies du tracé décalées derrière la face, à
 * 25 % d'opacité. **Les pages publiques la laissent à 1**, donc un seul tracé.
 * À cette taille, trois couches ne se lisent pas comme un relief mais comme un
 * flou — le dessin double, il n'épaissit pas. L'épaisseur reste dans les états
 * vides de l'app (`IsoIconScene`), où l'icône est assez grande pour la porter.
 */
export function IsoTile({
  name,
  className,
  depth = 1,
}: {
  name: IsoTileName;
  className?: string;
  depth?: number;
}) {
  return <IsoIconTile icon={ICONS[name]} className={className} depth={depth} />;
}

/**
 * La même chose pour un appelant qui tient DÉJÀ le composant d'icône — donc un
 * composant client, la seule frontière où passer une icône est possible (le menu
 * « Produit » de la nav). Ailleurs, on passe par `IsoTile` et son registre.
 */
export function IsoIconTile({
  icon,
  className,
  depth = 1,
}: {
  icon: LucideIcon;
  className?: string;
  depth?: number;
}) {
  return (
    <IsoBox className={className}>
      <IsoIcon icon={icon} depth={depth} className="aspect-square w-[70.7%]" />
    </IsoBox>
  );
}

/**
 * Le même dessin, avec un CHIFFRE à la place de l'icône — le trajet numéroté
 * d'un retour utilisateur. Les pastilles rondes numérotées qui tenaient cette
 * place étaient les seules de la page à ne pas être en isométrie, et ça se
 * voyait : quatre cartes qui racontent une suite, dans un style que rien
 * d'autre ne portait.
 */
export function IsoNumber({
  value,
  className,
  depth = 1,
}: {
  value: string;
  className?: string;
  depth?: number;
}) {
  return (
    <IsoBox className={className}>
      <IsoIcon icon={isoGlyph(value)} depth={depth} className="aspect-square w-[70.7%]" />
    </IsoBox>
  );
}
