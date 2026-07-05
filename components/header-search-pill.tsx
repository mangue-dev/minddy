"use client";

import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  Kbd,
  type CommandMenuGroup,
} from "mangue-ui";
import { Search } from "lucide-react";

/**
 * Inline search pill (recreated from AutoKap): a cmdk command anchored to a
 * compact pill, opening a results popover. Focused by pressing F or ⌘K.
 */
export function HeaderSearchPill({ groups }: { groups: CommandMenuGroup[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isF = !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "f";
      if (isCmdK || (isF && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Command shouldFilter loop label="Rechercher">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            role="search"
            onClick={() => {
              inputRef.current?.focus();
              setOpen(true);
            }}
            className="flex h-8 cursor-text items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.8rem] font-medium shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  setQuery("");
                  inputRef.current?.blur();
                }
              }}
              placeholder="Rechercher…"
              className="hidden w-24 bg-transparent outline-none transition-[width] duration-200 ease-out placeholder:text-muted-foreground focus:w-56 sm:inline-block"
            />
            <Kbd className="ml-1 hidden opacity-60 sm:inline-flex">F</Kbd>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="w-[440px] overflow-hidden rounded-xl p-0 shadow-lg"
        >
          <Command.List className="max-h-[360px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Aucun résultat.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group
                key={group.key ?? group.heading}
                heading={group.heading}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.key}
                      value={`${item.key} ${item.label} ${(item.keywords ?? []).join(" ")}`}
                      onSelect={() => {
                        setOpen(false);
                        setQuery("");
                        item.onSelect?.();
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                    >
                      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{item.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
