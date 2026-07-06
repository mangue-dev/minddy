"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";
import { Check, Tag } from "lucide-react";
import { CategoryPill } from "@/components/category-pill";
import type { Category } from "@/lib/types";

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <CategoryPill
          key={c.id}
          category={c}
          onRemove={() => onChange(value.filter((id) => id !== c.id))}
        />
      ))}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Tag />
            {selected.length === 0 ? "Catégories" : "Ajouter"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {categories.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Aucune catégorie. Crée-en dans les Paramètres.
            </div>
          ) : (
            categories.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  onChange(toggle(value, c.id));
                }}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="truncate">{c.name}</span>
                {value.includes(c.id) && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
