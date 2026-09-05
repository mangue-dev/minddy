"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  toast,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";
import { Ellipsis, Plus, TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Field, FieldLabel } from "@/components/ui/field";
import { McpServiceLogo } from "@/components/mcp-service-logo";
import { MCP_PRESETS, mcpPresetForUrl, type McpPreset } from "@/lib/mcp-catalog";
import { mcpConnectionNeedsAuth, type McpConnection } from "@/lib/mcp-client";
import { useAuth } from "@/lib/auth-context";
import {
  MCP_CONNECTIONS_QUERY_KEY as queryKey,
  useMcpConnections,
} from "@/lib/use-mcp-connections";

const endpoint = "/api/account/mcp-connections";
const connectionChannel = "minddy:mcp-connections";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "save");
  return result;
}

export function AccountMcpClients() {
  const t = useTranslations("McpClients");
  const id = useId();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { data, isPending, isError, refetch } = useMcpConnections(user?.id);
  const [editing, setEditing] = useState<McpConnection | "new" | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [authMode, setAuthMode] = useState<"none" | "bearer" | "oauth">(
    "oauth",
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [headers, setHeaders] = useState("");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<McpPreset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (err: unknown) => {
    const code = err instanceof Error ? err.message : "save";
    if (code === "oauth") return t("errorOAuth");
    if (code === "headers") return t("errorHeaders");
    if (code === "endpoint") return t("errorEndpoint");
    if (code === "encryption") return t("errorEncryption");
    if (code === "invalid") return t("errorInvalid");
    if (code === "connection") return t("errorConnection");
    return t("errorSave");
  };
  useEffect(() => {
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(connectionChannel);
    if (channel) {
      channel.onmessage = () => void queryClient.invalidateQueries({ queryKey });
    }
    const current = new URL(window.location.href);
    const outcome = current.searchParams.get("mcp");
    if (outcome) {
      if (outcome === "connected") toast.success(t("oauthConnected"));
      channel?.postMessage("changed");
      void queryClient.invalidateQueries({ queryKey });
      current.searchParams.delete("mcp");
      window.history.replaceState(window.history.state, "", current);
    }
    return () => channel?.close();
  }, [queryClient, t]);

  const closeDialog = () => {
    setEditing(null);
    setToken("");
    setClientSecret("");
    setHeaders("");
    setError(null);
  };
  const edit = useCallback(
    (
      connection: McpConnection | "new",
      selected: McpPreset | null = null,
    ) => {
      setEditing(connection);
      setName(connection === "new" ? (selected?.name ?? "") : connection.name);
      setUrl(connection === "new" ? (selected?.url ?? "") : connection.url);
      setToken("");
      setClearToken(false);
      setTransport(connection === "new" ? "http" : connection.transport);
      setAuthMode(
        connection === "new" ? (selected?.auth ?? "oauth") : connection.auth_mode,
      );
      setClientId("");
      setClientSecret("");
      setHeaders("");
      setPreset(
        selected ??
          (connection === "new"
            ? null
            : (mcpPresetForUrl(connection.url) ?? null)),
      );
      setError(null);
    },
    [],
  );
  useEffect(() => {
    const connectionId = searchParams.get("mcp_connection");
    if (!connectionId || !data) return;
    const connection = data.connections.find((item) => item.id === connectionId);
    const current = new URL(window.location.href);
    current.searchParams.delete("mcp_connection");
    window.history.replaceState(window.history.state, "", current);
    if (connection) edit(connection);
  }, [data, edit, searchParams]);
  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const result = await request(path, method, body);
      await queryClient.invalidateQueries({ queryKey });
      return result;
    } catch (err) {
      setError(errorText(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openAuthorizationTab = () => {
    // Reserve the tab during the click, before saving or requesting an OAuth URL.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    else toast.error(t("popupBlocked"));
    return tab;
  };

  const authorize = async (
    connectionId: string,
    tab = openAuthorizationTab(),
  ) => {
    if (!tab) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request(
        `${endpoint}/${connectionId}/authorize`,
        "POST",
      );
      if (!result?.url) throw new Error("oauth");
      if (!tab.closed) tab.location.replace(result.url);
    } catch {
      tab.close();
      // The saved connection stays visible with its authentication tooltip.
    } finally {
      await queryClient.invalidateQueries({ queryKey });
      setBusy(false);
    }
  };

  const testConnection = async (connectionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await request(`${endpoint}/${connectionId}/test`, "POST");
      toast.success(t("testSuccess", { count: result.tools }));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const endpointFields = (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
        <Input
          id={`${id}-name`}
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-url`}>{t("url")}</FieldLabel>
        <Input
          id={`${id}-url`}
          type="url"
          required
          maxLength={2048}
          placeholder="https://example.com/mcp"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          aria-describedby={`${id}-support`}
        />
      </Field>
    </>
  );

  return (
    <section className="space-y-5" aria-label={t("title")}>
      <p className="text-sm text-muted-foreground">{t("routines")}</p>
      {isPending && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {isError && (
        <div role="alert">
          <p>{t("errorLoad")}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {data?.connections.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {data?.connections.map((connection) => (
        <div
          key={connection.id}
          className="flex items-center gap-3 rounded-lg border border-border p-3"
        >
          <McpServiceLogo service={mcpPresetForUrl(connection.url)?.id} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{connection.name}</p>
              {mcpConnectionNeedsAuth(connection) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("unauthenticated")}
                      className="size-5 shrink-0 text-orange-500 hover:text-orange-500"
                    >
                      <TriangleAlert className="size-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("unauthenticated")}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {new URL(connection.url).hostname}
            </p>
            {!connection.enabled && (
              <p className="text-xs text-muted-foreground">{t("disabled")}</p>
            )}
          </div>
          {connection.auth_mode === "oauth" && !connection.oauth_connected && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void authorize(connection.id)}
            >
              {t("signIn")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={t("manage", { name: connection.name })}
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => edit(connection)}>
                {t("edit")}
              </DropdownMenuItem>
              {connection.auth_mode === "oauth" &&
                connection.oauth_connected && (
                  <DropdownMenuItem
                    onSelect={() => void authorize(connection.id)}
                  >
                    {t("reconnect")}
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem
                onSelect={() => void testConnection(connection.id)}
              >
                {t("test")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void mutate(`${endpoint}/${connection.id}`, "PATCH", {
                    enabled: !connection.enabled,
                  })
                }
              >
                {connection.enabled ? t("disable") : t("enable")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={async () => {
                  if (await mutate(`${endpoint}/${connection.id}`, "DELETE"))
                    toast.success(t("removed"));
                }}
              >
                {t("remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <div className="space-y-3">
        <FieldLabel htmlFor={`${id}-search`}>{t("browse")}</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MCP_PRESETS.filter((item) =>
            `${item.name} ${item.id}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ).map((item) => (
            <Button
              key={item.id}
              type="button"
              disabled={busy || isPending || isError}
              onClick={() =>
                edit(
                  data?.connections.find(
                    (connection) =>
                      new URL(connection.url).href === new URL(item.url).href,
                  ) ?? "new",
                  item,
                )
              }
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-3 text-left"
            >
              <McpServiceLogo service={item.id} />
              <span className="min-w-0 flex-1 text-sm font-medium">
                {item.name}
              </span>
              <Plus
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          disabled={busy || isPending || isError}
          onClick={() => edit("new")}
        >
          {t("custom")}
        </Button>
      </div>
      {error && !editing && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) closeDialog();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {editing && (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                let parsedHeaders;
                if (headers.trim()) {
                  try {
                    parsedHeaders = JSON.parse(headers);
                  } catch {
                    setError(t("errorHeaders"));
                    return;
                  }
                }
                const needsAuthorization =
                  authMode === "oauth" &&
                  (editing === "new" ||
                    !editing.oauth_connected ||
                    editing.url !== url ||
                    !!clientId ||
                    !!clientSecret);
                const authorizationTab = needsAuthorization
                  ? openAuthorizationTab()
                  : null;
                if (needsAuthorization && !authorizationTab) return;
                const result = await mutate(
                  editing === "new" ? endpoint : `${endpoint}/${editing.id}`,
                  editing === "new" ? "POST" : "PATCH",
                  {
                    name,
                    url,
                    transport,
                    auth_mode: authMode,
                    ...(parsedHeaders !== undefined
                      ? { headers: parsedHeaders }
                      : {}),
                    ...(clientId ? { oauth_client_id: clientId } : {}),
                    ...(clientSecret
                      ? { oauth_client_secret: clientSecret }
                      : {}),
                    ...(token || clearToken || editing === "new"
                      ? { token: clearToken ? "" : token }
                      : {}),
                  },
                );
                if (result) {
                  const savedId = editing === "new" ? result.id : editing.id;
                  setEditing(null);
                  setToken("");
                  setClientSecret("");
                  setHeaders("");
                  if (authorizationTab)
                    await authorize(savedId, authorizationTab);
                  else toast.success(t("saved"));
                } else {
                  authorizationTab?.close();
                }
              }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <McpServiceLogo service={preset?.id} />
                  {editing === "new"
                    ? preset
                      ? t("connectService", { name: preset.name })
                      : t("custom")
                    : t("editService", { name: editing.name })}
                </DialogTitle>
                <DialogDescription>
                  {preset
                    ? t("connectDescription", { name: preset.name })
                    : t("customDescription")}
                </DialogDescription>
              </DialogHeader>
              {preset && preset.setup !== "standard" && (
                <p className="text-sm text-muted-foreground">
                  {t(preset.setup)}{" "}
                  <a
                    className="underline"
                    href={preset.docs}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("setupGuide")}
                  </a>
                </p>
              )}
              {!preset && endpointFields}
              {authMode === "bearer" && (
                <>
                  <Field>
                    <FieldLabel htmlFor={`${id}-token`}>
                      {t("token")}
                    </FieldLabel>
                    <Input
                      id={`${id}-token`}
                      type="password"
                      autoComplete="new-password"
                      maxLength={4096}
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      disabled={busy || clearToken}
                      aria-describedby={`${id}-token-hint`}
                    />
                  </Field>
                  <p
                    id={`${id}-token-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("tokenHint")}
                  </p>
                  {editing !== "new" && editing.has_token && (
                    <Field orientation="horizontal" className="justify-start">
                      <Checkbox
                        id={`${id}-clear-token`}
                        checked={clearToken}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          setClearToken(checked === true)
                        }
                      />
                      <FieldLabel htmlFor={`${id}-clear-token`}>
                        {t("clearToken")}
                      </FieldLabel>
                    </Field>
                  )}
                </>
              )}
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced" className="border-b-0">
                  <AccordionTrigger className="py-3 text-sm font-medium">
                    {t("advanced")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <p
                        id={`${id}-support`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("support")}
                      </p>
                      {preset && endpointFields}
                      <Field>
                        <FieldLabel htmlFor={`${id}-auth`}>
                          {t("authentication")}
                        </FieldLabel>
                        <Select
                          value={authMode}
                          disabled={busy}
                          onValueChange={(value) =>
                            setAuthMode(value as typeof authMode)
                          }
                        >
                          <SelectTrigger id={`${id}-auth`} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oauth">{t("oauth")}</SelectItem>
                            <SelectItem value="bearer">
                              {t("bearer")}
                            </SelectItem>
                            <SelectItem value="none">{t("noAuth")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {authMode === "oauth" && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            {t("oauthHint")}
                          </p>
                          <Accordion type="single" collapsible>
                            <AccordionItem
                              value="oauth-app"
                              className="border-b-0"
                            >
                              <AccordionTrigger className="py-3 text-sm font-medium">
                                {t("oauthAppSettings")}
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2">
                                  <Field>
                                    <FieldLabel htmlFor={`${id}-client`}>
                                      {t("clientId")}
                                    </FieldLabel>
                                    <Input
                                      id={`${id}-client`}
                                      value={clientId}
                                      maxLength={1024}
                                      disabled={busy}
                                      onChange={(event) =>
                                        setClientId(event.target.value)
                                      }
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel htmlFor={`${id}-secret`}>
                                      {t("clientSecret")}
                                    </FieldLabel>
                                    <Input
                                      id={`${id}-secret`}
                                      type="password"
                                      autoComplete="new-password"
                                      value={clientSecret}
                                      maxLength={4096}
                                      disabled={busy}
                                      onChange={(event) =>
                                        setClientSecret(event.target.value)
                                      }
                                    />
                                  </Field>
                                  <p className="text-xs text-muted-foreground">
                                    {t("callback")}{" "}
                                    <code className="break-all select-all">
                                      {data?.callback_url}
                                    </code>
                                  </p>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      )}
                      <div className="mt-2 space-y-2">
                        <Field>
                          <FieldLabel htmlFor={`${id}-transport`}>
                            {t("transport")}
                          </FieldLabel>
                          <Select
                            value={transport}
                            disabled={busy}
                            onValueChange={(value) =>
                              setTransport(value as typeof transport)
                            }
                          >
                            <SelectTrigger
                              id={`${id}-transport`}
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="http">
                                Streamable HTTP
                              </SelectItem>
                              <SelectItem value="sse">SSE</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${id}-headers`}>
                            {t("headers")}
                          </FieldLabel>
                          <Textarea
                            id={`${id}-headers`}
                            className="min-h-24 font-mono text-sm"
                            value={headers}
                            autoComplete="off"
                            maxLength={64000}
                            disabled={busy}
                            onChange={(event) => setHeaders(event.target.value)}
                            placeholder={'{"X-API-Key": "…"}'}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("headersHint")}
                          </p>
                        </Field>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? t("saving")
                    : authMode === "oauth" &&
                        (editing === "new" || !editing.oauth_connected)
                      ? t("signIn")
                      : t("save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={closeDialog}
                >
                  {t("cancel")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
