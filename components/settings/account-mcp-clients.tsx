"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Alert01Icon, CheckIcon, CheckmarkCircle02Icon, Delete02Icon, FlashIcon, Globe02Icon, Key01Icon, Login03Icon, MoreHorizontalIcon, PencilEdit02Icon, RefreshIcon, ToggleOffIcon, ToggleOnIcon } from "@hugeicons/core-free-icons";
import {useCallback, useEffect, useId, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useSearchParams} from "next/navigation";
import {useTranslations} from "next-intl";
import { Button } from "@/components/ui/button";
import { useMountedWhileClosing } from "@/components/ui/overlay-freeze";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {Field, FieldLabel} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {WizardDialog, type WizardStep} from "@/components/wizard/wizard-dialog";
import {WizardChoiceCard} from "@/components/wizard/wizard-choice-card";
import {McpServiceLogo} from "@/components/mcp-service-logo";
import {SettingsGroup} from "@/components/settings/settings-ui";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import {MCP_PRESETS, mcpPresetForUrl} from "@/lib/mcp-catalog";
import type {McpPreset} from "@/lib/mcp-catalog";
import type {McpRegistryServer} from "@/lib/mcp-registry";
import {
  MCP_REGISTRY_SEARCH_MIN_LENGTH,
  useMcpRegistrySearch,
} from "@/lib/use-mcp-registry-search";
import {mcpConnectionNeedsAuth} from "@/lib/mcp-connection";
import type {McpConnection} from "@/lib/mcp-connection";
import {MCP_AUTHORIZATION_PARAM, MCP_DESKTOP_PARAM, prepareMcpAuthorization} from "@/lib/mcp-authorization";
import {getDesktopBridge} from "@/lib/desktop/bridge";
import {useAuth} from "@/lib/auth-context";
import {MCP_CONNECTIONS_QUERY_KEY as queryKey, useMcpConnections} from "@/lib/use-mcp-connections";

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

/**
 * A registry match rides the same dialog as a curated preset, but carries no
 * verified docs or setup note: the endpoint fields stay visible at the top,
 * like a custom server, so the URL the registry found is there to check.
 */
function registryPreset(server: McpRegistryServer): McpPreset {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    // Unknown unless the registry declared a token: OAuth is what most
    // remote servers use, and the wizard then lets the user choose.
    auth: server.auth ?? "oauth",
    setup: "standard",
    docs: "",
  };
}

/**
 * The editor's steps. "server" asks for the endpoint only when no curated
 * preset vouches for it; "access" saves; "check" follows the saved
 * connection until its sign-in completes and its first test answers.
 */
type StepId = "server" | "access" | "check";

type ConnectionCheck =
  | { status: "idle" | "testing" }
  | { status: "ok"; tools: number }
  | { status: "failed"; message: string };

export function AccountMcpClients() {
  const t = useTranslations("McpClients");
  const id = useId();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { data, isPending, isError, refetch } = useMcpConnections(user?.id);
  const [editing, setEditing] = useState<McpConnection | "new" | null>(null);
  // The wizard stays mounted, on the connection it showed, for its exit.
  const wizardMounted = useMountedWhileClosing(editing !== null);
  const lastEditing = useRef(editing);
  if (editing) lastEditing.current = editing;
  const shownEditing = editing ?? lastEditing.current;
  // Removal is destructive, so the menu only opens a confirmation (DESIGN.md).
  const [toRemove, setToRemove] = useState<McpConnection | null>(null);
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
  // Whether the sign-in step asks for the method. A catalog service, a
  // registry entry that declares it, or a saved connection already knows it:
  // the step then shows that method, with a way to change it.
  const [chooseAuth, setChooseAuth] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  // Set once the access step saved: going back from the check step edits
  // that connection instead of creating a second one.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [check, setCheck] = useState<ConnectionCheck>({ status: "idle" });
  // The public registry search (MIN-586): everything the curated catalog
  // leaves out, found by the same search box.
  const registry = useMcpRegistrySearch(search);
  const [busy, setBusy] = useState(false);
  // The desktop handoff lands here to start OAuth in this browser session;
  // discovery and registration can take a few seconds, so the wait is shown.
  const [autoStarting, setAutoStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (err: unknown) => {
    const code = err instanceof Error ? err.message : "save";
    if (code === "oauth") return t("errorOAuth");
    if (code === "oauth_client_rejected") return t("errorOAuthClientRejected");
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
      // Every outcome is announced: an "error" that only vanished from the URL
      // read as "nothing happened" after a completed provider consent.
      if (outcome === "connected") toast.success(t("oauthConnected"));
      else toast.error(t("oauthFailed"));
      channel?.postMessage("changed");
      void queryClient.invalidateQueries({ queryKey });
      current.searchParams.delete("mcp");
      window.history.replaceState(window.history.state, "", current);
    }
    const refreshOnFocus = () => {
      if (getDesktopBridge()) void queryClient.invalidateQueries({ queryKey });
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      channel?.close();
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [queryClient, t]);

  useEffect(() => {
    const current = new URL(window.location.href);
    const connectionId = current.searchParams.get(MCP_AUTHORIZATION_PARAM);
    // A desktop handoff opens this page in the system browser; the marker
    // tells the server to bounce the browser back to the app at the end.
    const desktopHandoff =
      current.searchParams.get(MCP_DESKTOP_PARAM) === "1";
    if (!connectionId || !data || getDesktopBridge()) return;
    current.searchParams.delete(MCP_AUTHORIZATION_PARAM);
    current.searchParams.delete(MCP_DESKTOP_PARAM);
    window.history.replaceState(window.history.state, "", current);
    // Only start for a connection owned by the signed-in browser account.
    if (!data.connections.some((connection) => connection.id === connectionId)) {
      toast.error(t("errorOAuth"));
      return;
    }
    setAutoStarting(true);
    setBusy(true);
    void request(
      `${endpoint}/${connectionId}/authorize`,
      "POST",
      desktopHandoff ? { desktop: true } : undefined,
    )
      .then((result) => {
        if (!result?.url) throw new Error("oauth");
        window.location.replace(result.url);
      })
      .catch((err) =>
        toast.error(
          err instanceof Error && err.message === "oauth_client_rejected"
            ? t("errorOAuthClientRejected")
            : t("errorOAuth"),
        ),
      )
      .finally(() => {
        setBusy(false);
        setAutoStarting(false);
      });
  }, [data, t]);

  const closeDialog = () => {
    setEditing(null);
    setToken("");
    setClientSecret("");
    setHeaders("");
    setError(null);
    setSavedId(null);
    setCheck({ status: "idle" });
  };
  const edit = useCallback(
    (
      connection: McpConnection | "new",
      selected: McpPreset | null = null,
      {
        authKnown = !!selected?.docs,
        transport: selectedTransport = "http",
      }: { authKnown?: boolean; transport?: "http" | "sse" } = {},
    ) => {
      setEditing(connection);
      setName(connection === "new" ? (selected?.name ?? "") : connection.name);
      setUrl(connection === "new" ? (selected?.url ?? "") : connection.url);
      setToken("");
      setClearToken(false);
      setTransport(connection === "new" ? selectedTransport : connection.transport);
      setChooseAuth(connection === "new" && !authKnown);
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
      setStepIndex(0);
      setSavedId(null);
      setCheck({ status: "idle" });
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
    const tab = prepareMcpAuthorization();
    if (!tab) toast.error(t("popupBlocked"));
    return tab;
  };

  // The registry is searched with the same box; catalog presets win, so a
  // match never shows twice. Only a settled, error-free search renders.
  const registryResults = (registry.servers ?? []).filter(
    (server) => !mcpPresetForUrl(server.url),
  );
  const registryVisible =
    registry.debounced.trim().length >= MCP_REGISTRY_SEARCH_MIN_LENGTH;

  const authorize = async (
    connectionId: string,
    tab = openAuthorizationTab(),
  ) => {
    if (!tab) return;
    setBusy(true);
    setError(null);
    try {
      await tab.authorize(connectionId, async () => {
        const result = await request(
          `${endpoint}/${connectionId}/authorize`,
          "POST",
        );
        if (!result?.url) throw new Error("oauth");
        return result.url;
      });
    } catch (err) {
      tab.close();
      // The saved connection stays visible with its authentication tooltip.
      toast.error(errorText(err));
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
          placeholder={t("urlPlaceholder")}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          aria-describedby={`${id}-support`}
        />
      </Field>
    </>
  );

  // The connection the wizard works on: the one it just saved, else the one
  // opened for editing. `null` until a new connection is first saved.
  const current =
    (savedId
      ? data?.connections.find((connection) => connection.id === savedId)
      : undefined) ?? (editing && editing !== "new" ? editing : null);
  const targetId = savedId ?? current?.id ?? null;
  const awaitingSignIn =
    savedId !== null && authMode === "oauth" && !current?.oauth_connected;
  const askServer = !preset || !preset.docs;
  const stepIds: StepId[] = askServer
    ? ["server", "access", "check"]
    : ["access", "check"];
  const stepId = stepIds[Math.min(stepIndex, stepIds.length - 1)];

  const runCheck = async (connectionId: string) => {
    setCheck({ status: "testing" });
    try {
      const result = await request(`${endpoint}/${connectionId}/test`, "POST");
      setCheck({ status: "ok", tools: Number(result.tools) || 0 });
    } catch (err) {
      setCheck({ status: "failed", message: errorText(err) });
    }
  };

  // The first test starts by itself as soon as there is something to test:
  // right after saving, or once the sign-in in the other tab completes and
  // the refreshed list reports it.
  useEffect(() => {
    if (stepId !== "check" || !savedId || awaitingSignIn) return;
    if (check.status !== "idle") return;
    void runCheck(savedId);
  }, [stepId, savedId, awaitingSignIn, check.status, runCheck]);

  const save = async () => {
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
      (!current ||
        !current.oauth_connected ||
        current.url !== url ||
        !!clientId ||
        !!clientSecret);
    // Reserved before any await: a tab opened after one is a blocked pop-up.
    const authorizationTab = needsAuthorization ? openAuthorizationTab() : null;
    if (needsAuthorization && !authorizationTab) return;
    const result = await mutate(
      targetId ? `${endpoint}/${targetId}` : endpoint,
      targetId ? "PATCH" : "POST",
      {
        name,
        url,
        transport,
        auth_mode: authMode,
        ...(parsedHeaders !== undefined ? { headers: parsedHeaders } : {}),
        ...(clientId ? { oauth_client_id: clientId } : {}),
        ...(clientSecret ? { oauth_client_secret: clientSecret } : {}),
        // A new connection always states its token; a saved one keeps it
        // unless a new value or the removal is asked for.
        ...(token || clearToken || !current
          ? { token: clearToken ? "" : token }
          : {}),
      },
    );
    if (!result) {
      authorizationTab?.close();
      return;
    }
    const connectionId: string = targetId ?? result.id;
    setSavedId(connectionId);
    setToken("");
    setClearToken(false);
    setClientSecret("");
    setHeaders("");
    setCheck({ status: "idle" });
    setStepIndex(stepIds.indexOf("check"));
    if (authorizationTab) await authorize(connectionId, authorizationTab);
  };

  const submitStep = (step: StepId) => {
    setError(null);
    if (step === "server") {
      // The address is checked here rather than after the sign-in choice: a
      // mistyped URL is easier to fix while it is still on screen.
      let parsed: URL | null = null;
      try {
        parsed = new URL(url.trim());
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.protocol !== "https:") {
        setError(t("errorEndpoint"));
        return;
      }
      setStepIndex(stepIds.indexOf("access"));
      return;
    }
    if (step === "access") {
      void save();
      return;
    }
    if (check.status === "ok") toast.success(t("saved"));
    closeDialog();
  };

  // Accidental closes only ask while something typed would be lost; once
  // saved, the connection waits in the list.
  const unsaved =
    stepId !== "check" &&
    (!!token ||
      !!clientId ||
      !!clientSecret ||
      !!headers.trim() ||
      (editing === "new" && !preset && (!!name.trim() || !!url.trim())));

  const authOptions = [
    { mode: "oauth", icon: Login03Icon, label: t("oauth"), description: t("oauthChoice"), known: t("oauthKnown", { name }) },
    { mode: "bearer", icon: Key01Icon, label: t("bearer"), description: t("bearerChoice"), known: t("bearerKnown", { name }) },
    { mode: "none", icon: Globe02Icon, label: t("noAuth"), description: t("noAuthChoice"), known: t("noAuthKnown", { name }) },
  ] as const;
  const knownAuth =
    authOptions.find((option) => option.mode === authMode) ?? authOptions[0];
  const setupNote =
    preset && preset.setup !== "standard" ? (
      <>
        {t(preset.setup)}{" "}
        <a className="underline" href={preset.docs} target="_blank" rel="noreferrer">
          {t("setupGuide")}
        </a>
      </>
    ) : null;

  const advancedSettings = (
    <Accordion type="single" collapsible>
      <AccordionItem value="advanced" className="border-b-0">
        <AccordionTrigger className="py-3 text-sm font-medium">
          {t("advanced")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            {!askServer && (
              <>
                <p id={`${id}-support`} className="text-xs text-muted-foreground">
                  {t("support")}
                </p>
                {endpointFields}
              </>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-transport`}>{t("transport")}</FieldLabel>
              <Select
                value={transport}
                disabled={busy}
                onValueChange={(value) => setTransport(value as typeof transport)}
              >
                <SelectTrigger id={`${id}-transport`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">Streamable HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-headers`}>{t("headers")}</FieldLabel>
              <Textarea
                id={`${id}-headers`}
                className="min-h-24 font-mono text-sm"
                value={headers}
                autoComplete="off"
                maxLength={64000}
                disabled={busy}
                onChange={(event) => setHeaders(event.target.value)}
                placeholder={t("headersPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("headersHint")}</p>
            </Field>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  const stepDefs: Record<StepId, WizardStep<StepId>> = {
    server: {
      id: "server",
      title: t("serverTitle"),
      // A registry match was found by a search, not vouched for: its address
      // is the one thing worth reading before going further.
      subtitle: preset ? t("registryCheck") : t("customDescription"),
      submitDisabled: busy || !name.trim() || !url.trim(),
      content: (
        <div className="space-y-4">
          {endpointFields}
          <p id={`${id}-support`} className="text-xs text-muted-foreground">
            {t("support")}
          </p>
        </div>
      ),
    },
    access: {
      id: "access",
      title: chooseAuth
        ? t("accessTitle", { name: name || preset?.name || "" })
        : editing !== "new" && editing
          ? t("editService", { name })
          : t("connectService", { name }),
      subtitle: chooseAuth
        ? t("accessDescription")
        : t("connectDescription", { name }),
      wide: chooseAuth,
      submitLabel: busy
        ? t("saving")
        : authMode === "oauth" && !current?.oauth_connected
          ? t("saveAndConnect")
          : t("save"),
      submitDisabled: busy,
      content: (
        <div className="space-y-5">
          {chooseAuth ? (
            <>
              {setupNote && (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {setupNote}
                </p>
              )}
              <div
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                role="radiogroup"
                aria-label={t("authentication")}
              >
                {authOptions.map((option) => (
                  <WizardChoiceCard
                    key={option.mode}
                    icon={option.icon}
                    label={option.label}
                    description={option.description}
                    selected={authMode === option.mode}
                    onSelect={() => setAuthMode(option.mode)}
                  />
                ))}
              </div>
            </>
          ) : (
            // The method is known: shown, not asked. Its description is the
            // provider's own setup note when there is one.
            <div className="flex items-start gap-3 rounded-lg border border-border p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <HugeiconsIcon icon={knownAuth.icon} className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{knownAuth.label}</p>
                <p className="text-sm text-muted-foreground">
                  {setupNote ?? knownAuth.known}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                disabled={busy}
                onClick={() => setChooseAuth(true)}
              >
                {t("authChange")}
              </Button>
            </div>
          )}
          {authMode === "bearer" && (
            <div className="space-y-2">
              <Field>
                <FieldLabel htmlFor={`${id}-token`}>{t("token")}</FieldLabel>
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
              <p id={`${id}-token-hint`} className="text-xs text-muted-foreground">
                {t("tokenHint")}
              </p>
              {current?.has_token && (
                <Field orientation="horizontal" className="justify-start">
                  <Checkbox
                    id={`${id}-clear-token`}
                    checked={clearToken}
                    disabled={busy}
                    onCheckedChange={(checked) => setClearToken(checked === true)}
                  />
                  <FieldLabel htmlFor={`${id}-clear-token`}>
                    {t("clearToken")}
                  </FieldLabel>
                </Field>
              )}
            </div>
          )}
          <div>
            {/* A catalog service with a standard sign-in needs no OAuth app of
                the user's own: the section stays out of the way unless the
                provider asks for one or the method is being chosen. */}
            {authMode === "oauth" && (chooseAuth || preset?.setup !== "standard") && (
              <Accordion type="single" collapsible>
                <AccordionItem value="oauth-app" className="border-b-0">
                  <AccordionTrigger className="py-3 text-sm font-medium">
                    {t("oauthAppSettings")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      <Field>
                        <FieldLabel htmlFor={`${id}-client`}>{t("clientId")}</FieldLabel>
                        <Input
                          id={`${id}-client`}
                          value={clientId}
                          maxLength={1024}
                          disabled={busy}
                          onChange={(event) => setClientId(event.target.value)}
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
                          onChange={(event) => setClientSecret(event.target.value)}
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
            )}
            {advancedSettings}
          </div>
        </div>
      ),
    },
    check: {
      id: "check",
      title: awaitingSignIn ? t("checkSignInTitle") : t("checkTitle", { name }),
      subtitle: awaitingSignIn ? t("checkSignInDescription", { name }) : undefined,
      submitLabel: t("finish"),
      content: awaitingSignIn ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner />
            {t("checkWaiting")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !savedId}
            onClick={() => savedId && void authorize(savedId)}
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden />
            {t("signInAgain")}
          </Button>
        </div>
      ) : check.status === "ok" ? (
        <p className="flex items-center gap-2 text-sm" role="status">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          {t("checkSuccess", { name, count: check.tools })}
        </p>
      ) : check.status === "failed" ? (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="flex items-start gap-2 text-sm">
            <HugeiconsIcon
              icon={Alert01Icon}
              className="mt-0.5 size-4 shrink-0 text-orange-500"
              aria-hidden
            />
            <span>
              {check.message} {t("checkFailedHint")}
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => savedId && void runCheck(savedId)}
          >
            <HugeiconsIcon icon={FlashIcon} className="size-4" aria-hidden />
            {t("test")}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t("checking")}
        </p>
      ),
    },
  };

  const wizard = wizardMounted && shownEditing && (
    <WizardDialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open && !busy) closeDialog();
      }}
      label={
        shownEditing === "new"
          ? preset
            ? t("connectService", { name: preset.name })
            : t("custom")
          : t("editService", { name: shownEditing.name })
      }
      steps={stepIds.map((step) => stepDefs[step])}
      stepIndex={stepIndex}
      onStepIndexChange={(index) => {
        setError(null);
        setStepIndex(index);
      }}
      onSubmit={submitStep}
      submitting={busy && stepId !== "check"}
      error={error}
      dismissConfirm={
        unsaved
          ? {
              title: t("discardTitle"),
              description: t("discardDescription"),
              confirmLabel: t("discard"),
              cancelLabel: t("keepEditing"),
            }
          : undefined
      }
    />
  );

  const content = (
    <section className="space-y-5" aria-label={t("title")}>
      <p className="text-sm text-muted-foreground">{t("routines")}</p>
      {autoStarting && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("openingSignIn")}
        </p>
      )}
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
                      <HugeiconsIcon icon={Alert01Icon} className="size-4" aria-hidden />
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
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => edit(connection)}>
                <HugeiconsIcon icon={PencilEdit02Icon} />
                {t("edit")}
              </DropdownMenuItem>
              {connection.auth_mode === "oauth" &&
                connection.oauth_connected && (
                  <DropdownMenuItem
                    onSelect={() => void authorize(connection.id)}
                  >
                    <HugeiconsIcon icon={RefreshIcon} />
                    {t("reconnect")}
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem
                onSelect={() => void testConnection(connection.id)}
              >
                <HugeiconsIcon icon={FlashIcon} />
                {t("test")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void mutate(`${endpoint}/${connection.id}`, "PATCH", {
                    enabled: !connection.enabled,
                  })
                }
              >
                <HugeiconsIcon icon={connection.enabled ? ToggleOffIcon : ToggleOnIcon} />
                {connection.enabled ? t("disable") : t("enable")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setToRemove(connection)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                {t("remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <ConfirmDeleteDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={t("removeConfirmTitle", { name: toRemove?.name ?? "" })}
        description={t("removeConfirmDescription")}
        confirmLabel={t("remove")}
        cancelLabel={t("cancel")}
        onConfirm={async () => {
          if (!toRemove) return;
          if (await mutate(`${endpoint}/${toRemove.id}`, "DELETE"))
            toast.success(t("removed"));
        }}
      />
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
          ).map((item) => {
            const connection = data?.connections.find(
              (existing) => mcpPresetForUrl(existing.url)?.id === item.id,
            );
            const needsAuth = connection
              ? mcpConnectionNeedsAuth(connection)
              : false;
            return (
              <Button
                key={item.id}
                type="button"
                disabled={busy || isPending || isError}
                onClick={() => edit(connection ?? "new", item)}
                variant="outline"
                className="h-auto justify-start gap-3 whitespace-normal p-3 text-left"
              >
                <McpServiceLogo service={item.id} />
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {item.name}
                </span>
                {/* Configured services read at a glance: a check when the
                    connection is authenticated, the orange triangle when it
                    still awaits sign-in — the same marks as the list above. */}
                {connection ? (
                  needsAuth ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          aria-label={t("unauthenticated")}
                          className="text-orange-500"
                        >
                          <HugeiconsIcon icon={Alert01Icon} className="size-4 shrink-0" aria-hidden />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t("unauthenticated")}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          aria-label={t("configured")}
                          className="text-emerald-600 dark:text-emerald-400"
                        >
                          <HugeiconsIcon icon={CheckIcon} className="size-4 shrink-0" aria-hidden />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t("configured")}</TooltipContent>
                    </Tooltip>
                  )
                ) : (
                  <HugeiconsIcon icon={Add01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </Button>
            );
          })}
        </div>
        {registryVisible && (
          <div className="space-y-2" aria-busy={registry.isPending}>
            <p className="text-xs font-medium text-muted-foreground">
              {t("registryTitle")}
            </p>
            {registry.isPending ? (
              <p className="text-sm text-muted-foreground">
                {t("registryLoading")}
              </p>
            ) : registryResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("registryNone")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {registryResults.map((server) => (
                  <Button
                    key={server.id}
                    type="button"
                    disabled={busy || isPending || isError}
                    onClick={() => {
                      const existing = data?.connections.find(
                        (connection) => connection.url === server.url,
                      );
                      edit(existing ?? "new", registryPreset(server), {
                        authKnown: !!server.auth,
                        transport: server.transport,
                      });
                    }}
                    variant="outline"
                    className="h-auto justify-start gap-3 whitespace-normal rounded-lg p-3 text-left"
                  >
                    {server.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={server.icon}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        className="size-5 shrink-0 object-contain"
                      />
                    ) : (
                      <McpServiceLogo className="size-5" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {server.name}
                      </span>
                      {server.description && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {server.description}
                        </span>
                      )}
                    </span>
                    <HugeiconsIcon icon={Add01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {error && !editing && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {wizard}
    </section>
  );

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountMcpClients}
      title={t("title")}
      variant="block"
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("custom")}
              disabled={busy || isPending || isError}
              onClick={() => edit("new")}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("custom")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("custom")}</TooltipContent>
        </Tooltip>
      }
    >
      {content}
    </SettingsGroup>
  );
}
