"use client";

// Searchable dropdowns for every field picker in the app (status, priority,
// effort, assignee, objective, parent, categories). The trigger is unchanged —
// the opened menu is the shared SearchMenu shell (a cmdk <Command> with an
// integrated search input that filters the options, Linear-style). Single- and
// multi-select variants both render it in trigger-anchored mode.

import * as React from "react";
import { Plus } from "lucide-react";
import { CommandGroup, CommandItem, CommandSeparator, Spinner, toast } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";

/**
 * Le déclencheur d'un picker qui se PRÉSENTE COMME UN CHAMP — posé dans une
 * ligne de formulaire, à côté d'un `Input` ou d'un `Button` outline.
 *
 * Il vit ici, et pas recopié chez chaque appelant, parce qu'il a divergé
 * exactement comme ça : les deux copies écrivaient `bg-transparent`, et le
 * champ paraissait donc VIDE à côté de ses voisins, qui sont en `bg-control`
 * (cf. `Input` et le variant `outline` de `Button` dans mangue-ui). Un fond
 * transparent est légitime sur une carte ; dans une rangée de champs, il se lit
 * comme un contrôle désactivé ou pas encore chargé.
 *
 * Les pickers dont le déclencheur est une PASTILLE (les champs compacts d'un
 * ticket) n'ont rien à voir avec ceci : ils passent leur propre `trigger`.
 */
export const PICKER_FIELD_TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-control px-3 text-sm outline-none transition-colors hover:bg-control-hover focus-visible:border-ring";

export type PickerOption = {
  value: string;
  /** Shown text — also the primary search term. */
  label: string;
  /** Extra search terms (e.g. an email alongside a display name). */
  keywords?: string[];
  /** Leading visual (indicator, avatar, color dot…). */
  icon?: React.ReactNode;
};

/**
 * Une dernière ligne du menu qui CRÉE ce qu'on ne trouve pas — l'ajout rapide
 * de catégorie / d'objectif depuis n'importe quel board. Elle n'existe qu'à
 * partir du moment où quelque chose est tapé : ce texte EST le nom de ce qu'on
 * crée, donc sans lui la ligne n'aurait rien à faire. Elle reste en revanche
 * visible quand la recherche ne matche rien — c'est là qu'elle sert le plus.
 *
 * Les hooks qui la fabriquent, avec leurs libellés traduits et leur écriture,
 * vivent dans lib/use-picker-create.ts — un picker ne fait que la passer.
 */
export type PickerCreateOption = {
  /** Libellé, construit sur le texte tapé (« Créer « design » »). */
  labelFor: (name: string) => string;
  /** Crée l'entité à partir du texte tapé (jamais vide). */
  onCreate: (name: string) => void | Promise<void>;
  /** Ferme le menu au lieu de le garder ouvert — le picker d'objectif passe la
   *  main à son dialog, qui a besoin du clavier. */
  closeOnCreate?: boolean;
};

/** La ligne de création, épinglée en bas du menu.
 *
 *  `forceMount` sur l'item ET sur son groupe : sans lui, cmdk masque l'un
 *  (score de filtre nul) et l'autre (aucun item enregistré dans le groupe) dès
 *  que la recherche ne matche pas — c'est-à-dire exactement quand on veut créer.
 *  Le séparateur, lui, ne s'affiche par défaut QUE recherche vide, d'où
 *  `alwaysRender`. */
export function PickerCreateRow({
  create,
  query,
  takenLabels,
  onDone,
}: {
  create: PickerCreateOption;
  /** Texte de recherche courant — il devient le nom de ce qu'on crée. */
  query: string;
  /** Les noms déjà pris dans ce menu (comparaison insensible à la casse). */
  takenLabels: string[];
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const name = query.trim();
  // Rien de tapé : pas de ligne (elle n'aurait pas de nom à donner).
  if (!name) return null;
  // Un nom déjà pris ne se propose pas une deuxième fois : la ligne existante
  // est juste au-dessus, la cocher est le bon geste.
  if (takenLabels.some((label) => label.trim().toLowerCase() === name.toLowerCase()))
    return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await create.onCreate(name);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CommandSeparator alwaysRender className="my-1" />
      <CommandGroup forceMount>
        <CommandItem
          forceMount
          value="__create__"
          disabled={busy}
          onSelect={() => void run()}
        >
          {busy ? (
            <Spinner className="size-4 shrink-0" />
          ) : (
            <Plus className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{create.labelFor(name)}</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}

/** cmdk forwards `data-checked` to the DOM; mangue-ui's CommandItem renders its
 *  trailing check from it. Spread (not a static prop) to stay type-safe.
 *
 *  Exporté pour les menus qui se construisent sur `SearchMenu` directement, sans
 *  passer par les deux variantes ci-dessous — un menu à PLUSIEURS dimensions (le
 *  filtre des pull requests : état + auteur) n'a pas une valeur mais deux, et
 *  doit donc cocher ses lignes lui-même. */
export const checkedProps = (checked: boolean) =>
  checked ? ({ "data-checked": "true" } as const) : {};

type ShellProps = {
  trigger: React.ReactNode;
  /** Optional tooltip on the trigger (used by the compact card pickers). */
  tooltip?: string;
  /** Key badge (e.g. "S") shown next to the tooltip — surfaces the shortcut. */
  shortcutHint?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** Stop pointer/click from bubbling to a draggable/clickable ancestor (cards). */
  stopPropagation?: boolean;
};

/** Open state + search text, shared by the two variants. The search is only
 *  controlled when a create row needs to read it (cmdk owns it otherwise). */
function usePickerShell(
  controlledOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  createOption: PickerCreateOption | undefined
) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const searchProps = createOption
    ? {
        searchValue: query,
        onSearchValueChange: setQuery,
        // « Aucun résultat » ne s'efface que quand la ligne de création prend
        // sa place. Recherche vide, elle n'existe pas : un projet sans aucune
        // catégorie garde donc son indication.
        hideEmpty: query.trim() !== "",
      }
    : {};
  return { open, setOpen, query, setQuery, searchProps };
}

/** Single-select searchable dropdown. Pass `noneOption` to add a top item that
 *  clears the value (nullable fields like effort / assignee / objective). */
export function SearchSelect({
  value,
  onChange,
  options,
  noneOption,
  createOption,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  value: string | null;
  onChange: (v: string | null) => void;
  options: PickerOption[];
  noneOption?: { label: string; icon?: React.ReactNode };
  /** Dernière ligne « Ajouter… » (voir {@link PickerCreateOption}). */
  createOption?: PickerCreateOption;
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { open, setOpen, query, setQuery, searchProps } = usePickerShell(
    controlledOpen,
    onOpenChange,
    createOption
  );
  const select = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <SearchMenu open={open} onOpenChange={setOpen} {...shell} {...searchProps}>
      <CommandGroup>
        {noneOption && (
          <CommandItem
            value="__none__"
            keywords={[noneOption.label]}
            onSelect={() => select(null)}
            {...checkedProps(value === null)}
          >
            {noneOption.icon}
            <span className="truncate">{noneOption.label}</span>
          </CommandItem>
        )}
        {options.map((opt) => (
          <CommandItem
            key={opt.value}
            value={opt.value}
            keywords={[opt.label, ...(opt.keywords ?? [])]}
            onSelect={() => select(opt.value)}
            {...checkedProps(value === opt.value)}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      {createOption && (
        <PickerCreateRow
          create={createOption}
          query={query}
          takenLabels={options.map((o) => o.label)}
          onDone={() => {
            setQuery("");
            if (createOption.closeOnCreate) setOpen(false);
          }}
        />
      )}
    </SearchMenu>
  );
}

/** Multi-select searchable dropdown (categories). Toggling keeps the menu open. */
export function SearchMultiSelect({
  values,
  onChange,
  options,
  createOption,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  values: string[];
  onChange: (values: string[]) => void;
  options: PickerOption[];
  /** Dernière ligne « Ajouter… » (voir {@link PickerCreateOption}). */
  createOption?: PickerCreateOption;
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { open, setOpen, query, setQuery, searchProps } = usePickerShell(
    controlledOpen,
    onOpenChange,
    createOption
  );
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <SearchMenu open={open} onOpenChange={setOpen} {...shell} {...searchProps}>
      <CommandGroup>
        {options.map((opt) => (
          <CommandItem
            key={opt.value}
            value={opt.value}
            keywords={[opt.label, ...(opt.keywords ?? [])]}
            onSelect={() => toggle(opt.value)}
            {...checkedProps(values.includes(opt.value))}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      {createOption && (
        <PickerCreateRow
          create={createOption}
          query={query}
          takenLabels={options.map((o) => o.label)}
          onDone={() => {
            // La sélection multiple reste ouverte : on vient d'ajouter une
            // étiquette, on en veut peut-être une deuxième. Le champ repart
            // vide pour ne pas cacher la liste derrière la recherche d'avant.
            setQuery("");
            if (createOption.closeOnCreate) setOpen(false);
          }}
        />
      )}
    </SearchMenu>
  );
}
