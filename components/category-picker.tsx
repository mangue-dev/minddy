"use client";

import { Button } from "mangue-ui";
import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryPill } from "@/components/category-pill";
import { SearchMultiSelect, type PickerOption } from "@/components/search-select";
import type { Category } from "@/lib/types";

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = categories.filter((c) => value.includes(c.id));
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const options: PickerOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: c.color }}
        aria-hidden
      />
    ),
  }));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <CategoryPill
          key={c.id}
          category={c}
          onRemove={() => onChange(value.filter((id) => id !== c.id))}
        />
      ))}
      <SearchMultiSelect
        values={value}
        onChange={onChange}
        options={options}
        align="start"
        emptyText={
          categories.length === 0
            ? `${tf("noCategories")} ${t("createInSettings")}`
            : undefined
        }
        trigger={
          <Button variant="outline" size="sm">
            <Tag />
            {selected.length === 0 ? tf("categories") : tc("add")}
          </Button>
        }
      />
    </div>
  );
}
