"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { Settings, TriangleAlert } from "lucide-react";
import { McpServiceLogo } from "@/components/mcp-service-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mcpPresetForUrl } from "@/lib/mcp-catalog";
import { mcpConnectionNeedsAuth, mcpSettingsHref } from "@/lib/mcp-client";
import { useMcpConnections } from "@/lib/use-mcp-connections";

/** Mounted with the add menu so closed composers do not fetch the catalog. */
export function McpMenuGroup({
  userId,
  query,
  onNavigate,
}: {
  userId: string;
  query: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("McpClients");
  const router = useRouter();
  const { data } = useMcpConnections(userId);
  const search = query.trim().toLocaleLowerCase();
  const connections = (data?.connections ?? []).filter(
    (connection) =>
      connection.enabled && connection.name.toLocaleLowerCase().includes(search),
  );
  const manage = (connectionId?: string) => {
    onNavigate();
    router.push(mcpSettingsHref(connectionId));
  };
  return (
    <CommandGroup heading="MCP">
      {connections.map((connection) => (
        <CommandItem
          key={connection.id}
          value={`mcp:${connection.id}`}
          onSelect={() => manage(connection.id)}
          className="gap-2"
        >
          <McpServiceLogo
            service={mcpPresetForUrl(connection.url)?.id}
            className="size-4"
          />
          <span className="min-w-0 flex-1 truncate">{connection.name}</span>
          {mcpConnectionNeedsAuth(connection) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="ml-auto inline-flex shrink-0"
                  role="img"
                  aria-label={t("unauthenticated")}
                >
                  <TriangleAlert className="size-4 text-orange-500" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("unauthenticated")}</TooltipContent>
            </Tooltip>
          )}
        </CommandItem>
      ))}
      <CommandItem
        forceMount
        value="manage-mcp"
        onSelect={() => manage()}
        className="gap-2"
      >
        <Settings className="size-4 shrink-0 text-muted-foreground" />
        <span>{t("manageConnections")}</span>
      </CommandItem>
    </CommandGroup>
  );
}
