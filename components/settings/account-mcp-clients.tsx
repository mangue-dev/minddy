"use client";

import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
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
import { McpServiceLogo } from "@/components/mcp-service-logo";
import { MCP_PRESETS, type McpPreset } from "@/lib/mcp-catalog";
import type { McpConnection } from "@/lib/mcp-client";

const queryKey = ["account-mcp-connections"];
const endpoint = "/api/account/mcp-connections";

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
  const { data, isPending, isError, refetch } = useQuery<{
    connections: McpConnection[];
    callback_url: string;
  }>({
    queryKey,
    queryFn: () => request(endpoint),
  });
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
    const current = new URL(window.location.href);
    const outcome = current.searchParams.get("mcp");
    if (!outcome) return;
    if (outcome === "connected") toast.success(t("oauthConnected"));
    current.searchParams.delete("mcp");
    window.history.replaceState(window.history.state, "", current);
  }, [t]);

  const closeDialog = () => {
    setEditing(null);
    setToken("");
    setClientSecret("");
    setHeaders("");
    setError(null);
  };
  const edit = (
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
          : (MCP_PRESETS.find((item) => item.url === connection.url) ?? null)),
    );
    setError(null);
  };
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

  const authorize = async (connectionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await request(
        `${endpoint}/${connectionId}/authorize`,
        "POST",
      );
      if (result?.url) window.location.assign(result.url);
    } catch {
      // The saved connection stays visible with its authentication tooltip.
    } finally {
      await queryClient.invalidateQueries({ queryKey });
      setBusy(false);
    }
  };

  const endpointFields = (
    <>
      <div className="space-y-1">
        <label className="text-sm" htmlFor={`${id}-name`}>
          {t("name")}
        </label>
        <Input
          id={`${id}-name`}
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm" htmlFor={`${id}-url`}>
          {t("url")}
        </label>
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
      </div>
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
          <McpServiceLogo
            service={
              MCP_PRESETS.find(
                (item) =>
                  new URL(item.url).href === new URL(connection.url).href,
              )?.id
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{connection.name}</p>
              {connection.auth_mode === "oauth" &&
                !connection.oauth_connected && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("unauthenticated")}
                        className="shrink-0 rounded-sm text-orange-500 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <TriangleAlert className="size-4" aria-hidden />
                      </button>
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
                onSelect={async () => {
                  const result = await mutate(
                    `${endpoint}/${connection.id}/test`,
                    "POST",
                  );
                  if (result)
                    toast.success(t("testSuccess", { count: result.tools }));
                }}
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
        <label className="text-sm" htmlFor={`${id}-search`}>
          {t("browse")}
        </label>
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
            <button
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
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <McpServiceLogo service={item.id} />
              <span className="min-w-0 flex-1 text-sm font-medium">
                {item.name}
              </span>
              <Plus
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
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
                  if (needsAuthorization) await authorize(savedId);
                  else toast.success(t("saved"));
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
                  <div className="space-y-1">
                    <label className="text-sm" htmlFor={`${id}-token`}>
                      {t("token")}
                    </label>
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
                  </div>
                  <p
                    id={`${id}-token-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("tokenHint")}
                  </p>
                  {editing !== "new" && editing.has_token && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={clearToken}
                        disabled={busy}
                        onChange={(event) =>
                          setClearToken(event.target.checked)
                        }
                      />
                      {t("clearToken")}
                    </label>
                  )}
                </>
              )}
              <details>
                <summary className="cursor-pointer text-sm">
                  {t("advanced")}
                </summary>
                <div className="mt-3 space-y-3">
                  <p
                    id={`${id}-support`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("support")}
                  </p>
                  {preset && endpointFields}
                  <div className="space-y-1">
                    <label className="block text-sm" htmlFor={`${id}-auth`}>
                      {t("authentication")}
                    </label>
                    <select
                      id={`${id}-auth`}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={authMode}
                      disabled={busy}
                      onChange={(event) =>
                        setAuthMode(event.target.value as typeof authMode)
                      }
                    >
                      <option value="oauth">{t("oauth")}</option>
                      <option value="bearer">{t("bearer")}</option>
                      <option value="none">{t("noAuth")}</option>
                    </select>
                  </div>
                  {authMode === "oauth" && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {t("oauthHint")}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {t("oauthAppSettings")}
                        </summary>
                        <div className="mt-2 space-y-2">
                          <label
                            className="block text-sm"
                            htmlFor={`${id}-client`}
                          >
                            {t("clientId")}
                          </label>
                          <Input
                            id={`${id}-client`}
                            value={clientId}
                            maxLength={1024}
                            disabled={busy}
                            onChange={(event) =>
                              setClientId(event.target.value)
                            }
                          />
                          <label
                            className="block text-sm"
                            htmlFor={`${id}-secret`}
                          >
                            {t("clientSecret")}
                          </label>
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
                          <p className="text-xs text-muted-foreground">
                            {t("callback")}{" "}
                            <code className="break-all select-all">
                              {data?.callback_url}
                            </code>
                          </p>
                        </div>
                      </details>
                    </div>
                  )}
                  <div className="mt-2 space-y-2">
                    <label
                      className="block text-sm"
                      htmlFor={`${id}-transport`}
                    >
                      {t("transport")}
                    </label>
                    <select
                      id={`${id}-transport`}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={transport}
                      disabled={busy}
                      onChange={(event) =>
                        setTransport(event.target.value as typeof transport)
                      }
                    >
                      <option value="http">Streamable HTTP</option>
                      <option value="sse">SSE</option>
                    </select>
                    <label className="block text-sm" htmlFor={`${id}-headers`}>
                      {t("headers")}
                    </label>
                    <textarea
                      id={`${id}-headers`}
                      className="min-h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
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
                  </div>
                </div>
              </details>
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
