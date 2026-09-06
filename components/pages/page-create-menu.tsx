"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";
import { Database, FileText } from "lucide-react";

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
          <FileText className="size-4" />
          {t("newPage")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(true)}>
          <Database className="size-4" />
          {tDatabase("newDatabase")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
