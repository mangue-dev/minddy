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
import { IsoIcon, isoGlyph } from "@/components/illustrations/iso-icon";

/**
 * Les icônes de la landing, dans l'isométrie de l'application (MIN-254).
 *
 * La page posait partout la même pastille : un carré arrondi gris avec une
 * icône lucide dedans, répétée d'une section à l'autre. C'est le dessin le plus
 * neutre possible — donc celui qui ne dit rien de minddy. Les illustrations de
 * l'app, elles, ont un style : l'icône posée sur un bloc isométrique
 * (`components/illustrations/iso-icon.tsx`). Le reprendre ici fait que la
 * landing et le produit se ressemblent enfin.
 *
 * POURQUOI UN REGISTRE DE NOMS et pas une prop `icon`. `IsoIcon` est un
 * composant client (il MESURE le tracé rendu pour l'inscrire dans la face du
 * bloc) et les sections de la landing sont des Server Components. Un composant
 * React ne se sérialise pas : passer `icon={Inbox}` depuis le serveur ne compile
 * pas. L'appelant passe donc un nom, et la résolution se fait ici, côté client.
 *
 * Un appelant qui tient DÉJÀ le composant d'icône — donc lui-même un composant
 * client, la seule frontière où passer une icône est possible : le menu
 * « Produit » de la nav, l'écran de confirmation d'e-mail — importe `IsoIcon`
 * directement. Ce module ne sert qu'au registre et au glyphe.
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
 * L'icône sur son bloc, désignée par son nom.
 *
 * L'appelant ne donne qu'une LARGEUR (`w-14`) : le bloc porte son propre rapport
 * — un cube vu en 2:1 est plus large que haut — et la hauteur suit.
 */
export function IsoTile({ name, className }: { name: IsoTileName; className?: string }) {
  return <IsoIcon icon={ICONS[name]} className={className} />;
}

/**
 * Le même dessin, avec un CHIFFRE à la place de l'icône — le trajet numéroté
 * d'un retour utilisateur. Les pastilles rondes numérotées qui tenaient cette
 * place étaient les seules de la page à ne pas être en isométrie, et ça se
 * voyait : quatre cartes qui racontent une suite, dans un style que rien
 * d'autre ne portait.
 */
export function IsoNumber({ value, className }: { value: string; className?: string }) {
  return <IsoIcon icon={isoGlyph(value)} className={className} />;
}
