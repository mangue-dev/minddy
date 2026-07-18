"use client";

import { useState } from "react";
import { Check, ChevronDown, Command as CommandIcon, X } from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import { EFFORTS, PRIORITIES, STATUSES, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import type { IssueUpdateInput, Member } from "@/lib/types";

/** Linear-style floating selection pill with all bulk actions in its command menu. */
export function BulkIssueActions({
  count,
  members,
  onUpdate,
  onDelete,
  onClear,
}: {
  count: number;
  members: Member[];
  onUpdate: (patch: IssueUpdateInput) => void;
  onDelete?: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const apply = (patch: IssueUpdateInput) => {
    onUpdate(patch);
    setOpen(false);
  };
  const deleteSelected = () => {
    if (onDelete && window.confirm(`Supprimer ${count} ticket(s) ?`)) {
      onDelete();
      setOpen(false);
    }
  };

  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur-md">
      <span className="px-3 text-sm font-medium whitespace-nowrap">{count} sélectionné(s)</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs">
            <CommandIcon className="size-3.5" />
            Actions
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" side="top" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Rechercher une action..." />
            <CommandList>
              <CommandEmpty>Aucune action trouvée.</CommandEmpty>
              <CommandGroup heading="Modifier">
                {STATUSES.map((item) => (
                  <CommandItem key={`status-${item.value}`} value={`statut ${item.value}`} onSelect={() => apply({ status: item.value as IssueStatus })}>
                    <span className="flex-1">Statut : {item.value}</span><Check className="size-3.5 opacity-50" />
                  </CommandItem>
                ))}
                {PRIORITIES.map((item) => (
                  <CommandItem key={`priority-${item.value}`} value={`priorité ${item.value}`} onSelect={() => apply({ priority: item.value as IssuePriority })}>
                    Priorité : {item.value}
                  </CommandItem>
                ))}
                {EFFORTS.map((item) => (
                  <CommandItem key={`effort-${item.value}`} value={`effort ${item.value}`} onSelect={() => apply({ effort: item.value as IssueEffort })}>
                    Effort : {item.value}
                  </CommandItem>
                ))}
                <CommandItem value="assigné non assigné" onSelect={() => apply({ assignee_id: null })}>Assigné : non assigné</CommandItem>
                {members.map((member) => (
                  <CommandItem key={`assignee-${member.user_id}`} value={`assigné ${member.display_name ?? member.user_id}`} onSelect={() => apply({ assignee_id: member.user_id })}>
                    Assigné : {member.display_name ?? member.user_id}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onDelete && (
                <CommandGroup heading="Danger">
                  <CommandItem value="supprimer les tickets" className="text-destructive" onSelect={deleteSelected}>Supprimer les tickets</CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" onClick={onClear} aria-label="Désélectionner les tickets">
        <X className="size-4" />
      </Button>
    </div>
  );
}
