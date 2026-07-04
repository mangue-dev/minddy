"use client";

import { useState } from "react";
import { Button, ConfirmDeleteDialog, Input, Spinner, cn, toast } from "mangue-ui";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from "@/lib/category-colors";
import type { Category } from "@/lib/types";

function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Couleur ${c}`}
          className={cn(
            "size-5 rounded-full ring-offset-2 ring-offset-background transition-shadow",
            value === c && "ring-2 ring-ring"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  category,
  onUpdate,
  onDelete,
}: {
  category: Category;
  onUpdate: (updates: { name?: string; color?: string }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onUpdate({ name: trimmed, color });
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Swatches value={color} onChange={setColor} />
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Annuler"
            onClick={() => {
              setEditing(false);
              setName(category.name);
              setColor(category.color);
            }}
          >
            <X />
          </Button>
          <Button size="icon-sm" aria-label="Enregistrer" disabled={saving} onClick={save}>
            {saving ? <Spinner /> : <Check />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className="size-3 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Modifier"
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Supprimer" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

export function ProjectCategories({ projectId }: { projectId: string }) {
  const { categories, createCategory, updateCategory, deleteCategory } =
    useCategoriesQuery(projectId);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createCategory({ name: trimmed, color });
      setName("");
      setColor(DEFAULT_CATEGORY_COLOR);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="category-name" className="text-sm font-medium">
              Nouvelle catégorie
            </label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bug, Feature, Design…"
            />
          </div>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? <Spinner /> : <Plus />}
            Ajouter
          </Button>
        </div>
        <Swatches value={color} onChange={setColor} />
      </form>

      <div className="flex flex-col divide-y divide-border">
        {categories.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Aucune catégorie pour l&apos;instant.
          </p>
        ) : (
          categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onUpdate={(updates) => updateCategory(c.id, updates)}
              onDelete={() => setToDelete(c)}
            />
          ))
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={toDelete ? `Supprimer « ${toDelete.name} » ?` : ""}
        description="La catégorie est retirée de toutes les issues qui la portent."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteCategory(toDelete.id);
            toast.success("Catégorie supprimée.");
            setToDelete(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
