"use client";

// The one palette color picker of the app (MIN-821): objectives, categories,
// page-database select options. It is the shared searchable `SearchSelect`,
// like every other field picker, so a color is found by typing its name.
//
// Each row shows a dot larger than a category's (size-4 against size-2.5:
// here the color IS the choice, not a mark next to a name) and the color's
// name written in that color. The name takes the page ink of the same shade
// (`--page-color-*`, app/globals.css), not the raw hex: those tokens are
// already adjusted per theme, so amber stays readable on white and every
// shade on black. lib/pages-color.test.ts keeps them aligned with the palette.

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";

const HEX_BY_NAME = new Map(
  CATEGORY_COLORS.map((hex) => [CATEGORY_COLOR_NAMES[hex] as string, hex as string]),
);

/** The dot of a palette color, at the size the menu shows it. */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10"
      style={{ backgroundColor: color }}
    />
  );
}

/** Capitalized for a list row; the catalogs keep the names lowercase where the
 *  language does, since they are also spliced into sentences ("Color red"). */
function capitalize(name: string, locale: string) {
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** The palette as picker options, searchable by translated name. Each option's
 *  value is the color's English name, not its hex: cmdk searches the value too,
 *  and "bl" would otherwise match teal's `#14b8a6`. */
function useColorOptions(): PickerOption[] {
  const tColors = useTranslations("Categories.colors");
  const locale = useLocale();
  return CATEGORY_COLORS.map((hex) => {
    const name = CATEGORY_COLOR_NAMES[hex];
    const label = capitalize(tColors(name), locale);
    return {
      // The English name also lets "red" find the red in every locale.
      value: name,
      label,
      icon: <ColorDot color={hex} />,
      labelNode: (
        <span className="truncate font-medium" style={{ color: `var(--page-color-${name})` }}>
          {label}
        </span>
      ),
    };
  });
}

/** The translated, capitalized name of a palette color; null for any other hex. */
export function useColorName(value: string | null): string | null {
  const tColors = useTranslations("Categories.colors");
  const locale = useLocale();
  const name = value ? CATEGORY_COLOR_NAMES[value.toLowerCase()] : undefined;
  return name ? capitalize(tColors(name), locale) : null;
}

/**
 * Searchable palette picker. The caller keeps its own `trigger` (a dot, a
 * property-row value…); pass `noneLabel` for a nullable color.
 */
export function ColorSelect({
  value,
  onChange,
  noneLabel,
  trigger,
  tooltip,
  shortcutHint,
  align = "start",
  open,
  onOpenChange,
  stopPropagation,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  /** Adds a first row that clears the color. */
  noneLabel?: string;
  trigger: React.ReactNode;
  tooltip?: string;
  shortcutHint?: string;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  stopPropagation?: boolean;
}) {
  const options = useColorOptions();
  return (
    <SearchSelect
      value={value ? (CATEGORY_COLOR_NAMES[value.toLowerCase()] ?? value) : null}
      onChange={(name) => onChange(name ? (HEX_BY_NAME.get(name) ?? null) : null)}
      options={options}
      noneOption={
        noneLabel
          ? {
              label: noneLabel,
              icon: (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-dashed border-muted-foreground/60"
                />
              ),
            }
          : undefined
      }
      trigger={trigger}
      tooltip={tooltip}
      shortcutHint={shortcutHint}
      align={align}
      open={open}
      onOpenChange={onOpenChange}
      stopPropagation={stopPropagation}
    />
  );
}
