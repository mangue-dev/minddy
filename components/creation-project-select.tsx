"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { SearchSelect } from "@/components/search-select";
import { Kbd } from "@/components/ui/kbd";
import { isProjectSwitchShortcut } from "@/lib/keyboard/project-switch-shortcut";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { captureWritingSpot, restoreWritingSpot, type WritingSpot } from "@/lib/keyboard/writing-spot";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

// Desktop: a pill mirroring the dialog's close button (top-4, 28px high,
// `bg-control`), on the opposite corner. Mobile: a plain trigger beside the
// sheet title, whose header row gives it the 44px touch height.
const DIALOG_PILL =
  "flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-control px-2.5 text-sm text-foreground outline-none transition-colors";
const SHEET_TRIGGER =
  "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 text-base font-medium text-foreground outline-none transition-colors";
const INTERACTIVE = "hover:bg-control-hover focus-visible:bg-control-hover";

/**
 * "Create in" control of the creation dialogs (MIN-741): the project the new
 * issue or objective lands in, chosen before writing it. With a single
 * possible project it still names the destination, without a menu.
 *
 * `placement="dialog"` pins it to the dialog's top-left corner, level with the
 * close button; `placement="sheet"` renders it inline after the mobile sheet
 * title, which then reads as "New issue · Project".
 */
export function CreationProjectSelect({
  projects,
  value,
  onChange,
  placement,
  disabled = false,
}: {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  placement: "dialog" | "sheet";
  disabled?: boolean;
}) {
  const t = useTranslations("Creation");
  const mod = useModKey();
  const current = projects.find((p) => p.id === value) ?? null;
  const selectable = projects.length > 1 && !disabled;
  const sheet = placement === "sheet";
  const [open, setOpen] = useState(false);
  // Set only when the shortcut opened the menu: closing it then returns to the
  // text exactly where the caret was, instead of the trigger.
  const writingSpot = useRef<WritingSpot | null>(null);

  // ⌘⇧P, shared with the sidebar switcher. Capturing on the document and
  // stopping the event keeps the sidebar's menu closed behind the dialog.
  useEffect(() => {
    if (!selectable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isProjectSwitchShortcut(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen((wasOpen) => {
        if (!wasOpen) writingSpot.current = captureWritingSpot();
        return !wasOpen;
      });
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [selectable]);
  const triggerClass = cn(sheet ? SHEET_TRIGGER : DIALOG_PILL, selectable && INTERACTIVE);
  const content = (
    <>
      {!sheet && <span className="shrink-0 text-muted-foreground">{t("createIn")}</span>}
      {current && (
        <>
          <ProjectOrb seed={projectOrbSeed(current)} iconUrl={current.icon_url} className="size-4 shrink-0" />
          <span className="truncate">{current.name}</span>
        </>
      )}
      {selectable && (
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      {/* The mobile sheet has no keyboard to show a shortcut for. */}
      {selectable && !sheet && (
        <span aria-hidden className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 opacity-60">
          <Kbd size="sm">{mod}</Kbd>
          <Kbd size="sm">⇧</Kbd>
          <Kbd size="sm">P</Kbd>
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "creation-project flex min-w-0",
        !sheet && "absolute top-4 left-4 z-10 max-w-[calc(100%-5rem)]"
      )}
    >
      {selectable ? (
        <SearchSelect
          open={open}
          onOpenChange={(next) => {
            if (next) writingSpot.current = null;
            setOpen(next);
          }}
          onCloseAutoFocus={(event) => {
            const spot = writingSpot.current;
            writingSpot.current = null;
            if (!spot) return;
            event.preventDefault();
            restoreWritingSpot(spot);
          }}
          value={value}
          onChange={(next) => {
            if (next && next !== value) onChange(next);
          }}
          options={projects.map((p) => ({
            value: p.id,
            label: p.name,
            keywords: [p.key],
            icon: <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-4 shrink-0" />,
          }))}
          searchPlaceholder={t("searchProject")}
          emptyText={t("noProject")}
          align="start"
          trigger={
            <button
              type="button"
              aria-label={t("createInAria", { project: current?.name ?? "" })}
              className={triggerClass}
            >
              {content}
            </button>
          }
        />
      ) : (
        <span className={triggerClass}>{content}</span>
      )}
    </div>
  );
}
