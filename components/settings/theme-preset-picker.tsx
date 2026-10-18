"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "mangue-ui";

import {
  THEME_PRESET_GROUPS,
  THEME_PRESETS,
  THEME_PRESETS_BY_MODE,
  type ThemePresetGroup,
  type ThemeMode,
  type ThemePresetId,
} from "@/lib/theme-presets";
import type { MessageKey } from "@/lib/i18n-keys";

const GROUP_LABELS: Record<ThemePresetGroup, MessageKey<"Account">> = {
  accent: "themePresetGroupAccent",
  palette: "themePresetGroupPalette",
  accessibility: "themePresetGroupAccessibility",
};

/**
 * A miniature of the palette: a square of its content surface, with an even
 * inset holding a line of text and the primary action. Painted with the
 * catalog's literal colors, so a dark palette previews as dark while the app
 * is light — nothing here touches the root `.dark` class or the live tokens.
 */
export function ThemePresetSwatch({ preset }: { preset: ThemePresetId }) {
  const { swatch } = THEME_PRESETS[preset];
  return (
    <span
      aria-hidden
      data-theme-swatch={preset}
      className="flex size-4 shrink-0 flex-col gap-[2px] rounded-[4px] p-[3px] ring-1 ring-black/10 dark:ring-white/15"
      style={{ background: swatch.background }}
    >
      <span className="h-[2px] w-full rounded-full" style={{ background: swatch.foreground }} />
      <span className="w-full flex-1 rounded-[2px]" style={{ background: swatch.primary }} />
    </span>
  );
}

/** Account → Preferences: the palette of ONE mode (MIN-696). The light and
 * the dark mode each get their own picker, so choosing a dark palette while
 * the app is light saves it for later without repainting anything now. */
export function ThemePresetPicker({
  id,
  mode,
  value,
  onChange,
  disabled,
}: {
  id: string;
  mode: ThemeMode;
  value: ThemePresetId;
  onChange: (preset: ThemePresetId) => void;
  disabled?: boolean;
}) {
  const ta = useTranslations("Account");
  const label = (preset: ThemePresetId) => {
    const info = THEME_PRESETS[preset].label;
    return "name" in info ? info.name : ta(info.key);
  };
  const presets: readonly ThemePresetId[] = THEME_PRESETS_BY_MODE[mode];

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ThemePresetId)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THEME_PRESET_GROUPS.map((group, index) => (
          <Fragment key={group}>
            {index > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>{ta(GROUP_LABELS[group])}</SelectLabel>
              {presets
                .filter((preset) => THEME_PRESETS[preset].group === group)
                .map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    <span className="flex items-center gap-2">
                      <ThemePresetSwatch preset={preset} />
                      {label(preset)}
                    </span>
                  </SelectItem>
                ))}
            </SelectGroup>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
