"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import type { Collaborator } from "@/lib/types";

/**
 * People from my other projects, proposed under an invite field (MIN-689):
 * avatar, name and address, one click to pick. Shared by the project wizard
 * and the members settings so both read the same.
 */
export function CollaboratorSuggestions({
  id,
  label,
  suggestions,
  onPick,
}: {
  /** Referenced by the field's `aria-controls`. */
  id: string;
  label: string;
  suggestions: readonly Collaborator[];
  onPick: (collaborator: Collaborator) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-left">
      <p className="px-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul id={id} role="listbox" aria-label={label} className="flex flex-col">
        {suggestions.map((c) => (
          <li key={c.user_id} role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <UserAvatar seed={c.avatar_seed} className="size-7" />
              <CollaboratorName collaborator={c} />
              <HugeiconsIcon icon={UserAdd01Icon} className="size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Name, with the address underneath when there is a name to show. */
export function CollaboratorName({
  collaborator,
}: {
  collaborator: Pick<Collaborator, "email" | "full_name">;
}) {
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm">{displayName(collaborator, collaborator.email)}</span>
      {collaborator.full_name?.trim() && (
        <span className="block truncate text-xs text-muted-foreground">{collaborator.email}</span>
      )}
    </span>
  );
}
