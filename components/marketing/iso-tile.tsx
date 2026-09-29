"use client";

import { IsoIcon, isoGlyph } from "@/components/illustrations/iso-icon";
import type { AppIcon } from "@/components/icon";
import { AppWindowMacIcon as AppWindowMac, BellRingIcon as BellRing, CalendarRangeIcon as CalendarRange, CommandIcon as Command, CrosshairIcon as Crosshair, FileTextIcon as FileText, FilterHorizontalIcon as ListFilter, InboxIcon as Inbox, LayersIcon as Layers, LayoutListIcon as LayoutList, Link02Icon as Link2, MessageMultiple01Icon as MessagesSquare, Mic01Icon as Mic, PencilLineIcon as PencilLine, Plug02Icon as Plug2, RefreshIcon as RefreshCw, Search01Icon as Search, Target01Icon as Target, Upload04Icon as Upload } from "@hugeicons/core-free-icons";

/**
 * The icons of the landing, in the isometry of the application (MIN-254).
 *
 * The page placed the same patch everywhere: a gray rounded square with a
 * lucid icon in it, repeated from one section to another. It's the most neutral drawing possible — so the one that doesn't say anything about minddy. The illustrations of
 * the app have a style: the icon placed on an isometric block
 * (`components/illustrations/iso-icon.tsx`). Resuming it here makes the
 * landing and the product finally look the same.
 *
 * WHY A REGISTER OF NAMES and not a `icon` prop. `IsoIcon` is a
 * client component (it MEASURES the rendered path to register it in the face of the
 * block) and the sections of the landing are Server Components. A component
 * React does not serialize: passing `icon={Inbox}` from the server does not compile
 *. The caller therefore passes a name, and the resolution is done here, on the client side.
 *
 * A caller who ALREADY holds the icon component - therefore itself a component
 * client, the only border where passing an icon is possible: the menu
 * "Product" of the nav, the confirmation screen email — imports `IsoIcon`
 * directly. This module is only used for the register and the glyph.
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
} as const satisfies Record<string, AppIcon>;

export type IsoTileName = keyof typeof ICONS;

/**
 * The icon on its block, designated by its name.
 *
 * The caller only gives a WIDTH (`w-14`): the block carries its own report
 * — a cube seen in 2:1 is wider than it is tall — and the height follows.
 */
export function IsoTile({ name, className }: { name: IsoTileName; className?: string }) {
  return <IsoIcon icon={ICONS[name]} className={className} />;
}

/**
 * The same drawing, with a NUMBER in place of the icon — the numbered path
 * of a user return. The round numbered dots that held this
 * place were the only ones on the page not to be in isometry, and it showed: four cards which tell a sequence, in a style that nothing else carried.
 */
export function IsoNumber({ value, className }: { value: string; className?: string }) {
  return <IsoIcon icon={isoGlyph(value)} className={className} />;
}
