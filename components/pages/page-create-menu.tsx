"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon, File02Icon } from "@hugeicons/core-free-icons";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";

export function PageCreateMenu({
  trigger,
  onCreate,
}: {
  trigger: ReactElement;
  onCreate: (database: boolean) => void;
}) {
  const t = useTranslations("Pages");
  const tDatabase = useTranslations("PageDatabase");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onCreate(false)}>
          <HugeiconsIcon icon={File02Icon} className="size-4" />
          {t("newPage")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(true)}>
          <HugeiconsIcon icon={DatabaseIcon} className="size-4" />
          {tDatabase("newDatabase")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
