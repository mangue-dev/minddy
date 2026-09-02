"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Cloud, FolderPlus, GitBranch, Laptop, Server } from "lucide-react";
import {
  Button,
  Command,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import type { LocalRepoRefusal } from "@/lib/desktop/local-repo";
import type { MessageKey } from "@/lib/i18n-keys";
import type { AgentExecutionBackend } from "@/lib/capabilities";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * WHERE THE CONVERSATION TURNS (MIN-359) — the fourth chip of the dialer, next to the
 * model, reasoning and branch.
 *
 * **Choose at the start of a conversation, frozen afterwards** (MIN-359),
 * exactly like its three neighbors and for the reason established in MIN-286:
 * each environment rereads ITS memory in the checkpoint. A conversation that
 * would change environment during life would not lose a setting, it
 * would lose its history. Hence the absence of hot fallback: a local run which does not
 * can't leave goes back to the cloud **before his first turn**, never after.
 *
 * ## It only appears where it means something
 *
 * No bridge (so no desktop app), no folder attached to this project on
 * THIS machine: the chip is not returned at all. It is the caller who decides,
 * with `useLocalRepo` — a grayed chip would promise a toggle that does not exist,
 * and a project member on Windows has nothing to understand or refuse.
 *
 * When a folder is attached but becomes invalid (moved, disk unmounted,
 * repository re-linked elsewhere), the “my machine” entry is still offered — and
 * By choosing it, you reopen the system panel. Hide option
 * would leave someone with no way of understanding why she disappeared.
 */

export type AgentEnvironment = "cloud" | "local" | "worktree";

/**
 * Why a file cannot be used → what the person reads.
 *
 * Exported from here and written to the `Agent` namespace, while the second
 * reader is a SETTINGS card: the four refusals are the same on both
 * sides, and copying them under `Settings` would make four more strings in two
 * catalogs — that is to say, four more opportunities to make them diverge.
 */
export const LOCAL_REPO_ERROR_KEYS: Record<LocalRepoRefusal, MessageKey<"Agent">> = {
  missing: "localRepoMissing",
  notGit: "localRepoNotGit",
  noRemote: "localRepoNoRemote",
  wrongRepo: "localRepoWrongRepo",
};

export function EnvironmentCombobox({
  value,
  onChange,
  folder,
  needsAttach = false,
  localAvailable = true,
  worktreeAvailable = true,
  cloudAvailable = true,
  /** True when the sandbox EXISTS but the project has no linked repository:
   * the cloud entry is shown greyed, and choosing it reopens the repository
   * link panel instead of launching a run that would be refused (`noRepo`). */
  cloudNeedsRepo = false,
  executionBackend = "vercel",
  onAttach,
  onLinkRepo,
  disabled,
  disabledTooltip,
  bare = false,
}: {
  value: AgentEnvironment;
  onChange: (value: AgentEnvironment) => void;
  /** The attached folder, so that the chip says WHICH and not just “local”. */
  folder?: string | null;
  /** The selected file is no longer worth anything: choosing “my machine” requires another one. */
  needsAttach?: boolean;
  /** False in the browser: the choice is visible but requires the Mac app. */
  localAvailable?: boolean;
  /** False when local execution is always isolated by the caller. */
  worktreeAvailable?: boolean;
  /** False for a private BYOK endpoint: it cannot exit to a microVM. */
  cloudAvailable?: boolean;
  /** True when the sandbox EXISTS but the project has no linked repository:
   * the cloud entry is shown greyed, and choosing it reopens the repository
   * link panel instead of launching a run that would be refused (`noRepo`). */
  cloudNeedsRepo?: boolean;
  /** Changes the server option from generic cloud wording to this instance's sandbox. */
  executionBackend?: AgentExecutionBackend;
  onAttach?: () => void;
  /** Opens the project's repository link panel (cloud entry without a link). */
  onLinkRepo?: () => void;
  disabled?: boolean;
  /** Tooltip of the locked chip (frozen environment for the conversation). */
  disabledTooltip?: string;
  /** Variant without outline, for the context bar above the composer. */
  bare?: boolean;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const serverIsSelfHosted = executionBackend === "self-hosted";
  const ServerIcon = serverIsSelfHosted ? Server : Cloud;
  const Icon = value === "cloud" ? ServerIcon : value === "worktree" ? GitBranch : Laptop;
  // The button names the type of environment, never the concrete path. THE
  // folder remains useful in the help menu, but a long path makes the chip
  // unstable and contradicts the local/cloud vocabulary of the application.
  const label =
    value === "cloud"
      ? t(serverIsSelfHosted ? "environmentServerSandbox" : "environmentCloud")
      : value === "worktree"
        ? t("environmentWorktree")
        : t("environmentLocal");

  // Locked: static chip + tooltip, WITHOUT popover — the exterior <span>
  // carries the hover, a `disabled` button not emitting a pointer event
  // (same assembly as the other three pickers of the composer).
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className={cn(
              "pointer-events-none flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/45",
              bare ? "bg-transparent" : "border border-border/60 bg-muted/40",
            )}>
              <Icon className="size-3.5 shrink-0" />
              <span className="max-w-40 truncate">{label}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const pick = (next: AgentEnvironment) => {
    setOpen(false);
    // The file is no longer worth anything: we do NOT switch to an empty promise,
    // we reopen the panel. It is the caller who will reconnect `value` if the
    // nouveau dossier passe.
    if (next !== "cloud" && needsAttach) {
      onAttach?.();
      return;
    }
    // The sandbox exists, the repository does not: the cloud entry explains
    // itself by its repair gesture, not by a refusal after the fact.
    if (next === "cloud" && cloudNeedsRepo) {
      onLinkRepo?.();
      return;
    }
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("environment")}
          disabled={disabled}
          className={cn(
            "h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80",
            bare ? "bg-transparent hover:bg-accent/50" : "border border-border/60 bg-muted/50 hover:bg-muted",
          )}
        >
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-40 truncate">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Only two entries, but each has a GLOSS — unlike the
 reasoning picker, where the order of the tiers already says what they
 are worth. Here the two words are not enough: "my machine" opens a real
 folder, with real files, and no one should have to
 learn it on the first run. */}
      <PopoverContent className="min-w-64 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList className="p-1">
            {cloudAvailable ? (
              <CommandItem
                value="cloud"
                aria-disabled={cloudNeedsRepo}
                className={cn(cloudNeedsRepo && "cursor-not-allowed opacity-50")}
                onSelect={() => pick("cloud")}
              >
                <ServerIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block">
                    {t(serverIsSelfHosted ? "environmentServerSandbox" : "environmentCloud")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {cloudNeedsRepo
                      ? t("environmentCloudNeedsRepo")
                      : t(serverIsSelfHosted ? "environmentServerSandboxHint" : "environmentCloudHint")}
                  </span>
                </span>
                <Check
                  className={cn("size-4 shrink-0", value === "cloud" ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ) : null}
            <CommandItem
              value="local"
              aria-disabled={!localAvailable}
              className={cn(!localAvailable && "cursor-not-allowed opacity-50")}
              onSelect={() => {
                if (localAvailable) pick("local");
              }}
            >
              {needsAttach ? (
                <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Laptop className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">
                <span className="block">{t("environmentLocal")}</span>
                <span className="block text-xs text-muted-foreground">
                  {!localAvailable ? (
                    <>
                      {t("environmentLocalDesktopHint")} {" "}
                      <Link
                        href="/download"
                        className="font-medium text-foreground underline underline-offset-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {t("environmentLocalDownload")}
                      </Link>
                    </>
                  ) : needsAttach
                    ? t("environmentLocalAttach")
                    : t("environmentLocalHint", { folder: folder ?? "" })}
                </span>
              </span>
              <Check
                className={cn(
                  "size-4 shrink-0",
                  value === "local" && !needsAttach ? "opacity-100" : "opacity-0",
                )}
              />
            </CommandItem>
            {worktreeAvailable ? (
              <CommandItem
                value="worktree"
                aria-disabled={!localAvailable}
                className={cn(!localAvailable && "cursor-not-allowed opacity-50")}
                onSelect={() => {
                  if (localAvailable) pick("worktree");
                }}
              >
                {needsAttach ? (
                  <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1">
                  <span className="block">{t("environmentWorktree")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {needsAttach
                      ? t("environmentLocalAttach")
                      : t("environmentWorktreeHint", { folder: folder ?? "" })}
                  </span>
                </span>
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    value === "worktree" && !needsAttach ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
