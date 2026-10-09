"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, LogOutIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { AuthProvider, useAuth, useAuthOptional } from "@/lib/auth-context";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { AccountQueryProvider } from "@/lib/account-query-provider";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { NumoFace } from "@/components/numo-face";
import { LazyToaster } from "@/components/lazy-toaster";
import { documentationPath } from "@/lib/documentation-core.mjs";
import type { Locale } from "@/i18n/config";

const DocumentationNumo = dynamic(() => import("./documentation-numo").then(m => m.DocumentationNumo), { ssr: false });
const SessionContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  articleId: string | null;
  setArticleId: (id: string | null) => void;
} | null>(null);

function Session({ children, locale }: { children: ReactNode; locale: Locale }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(null);
  const changeOpen = (next: boolean) => { setOpen(next); if (next) setActivated(true); };
  return <SessionContext.Provider value={{ open, setOpen: changeOpen, articleId, setArticleId }}>
    <div data-documentation-numo-open={user && open ? "true" : undefined}>{children}</div>
    {user && activated && <DocumentationNumo key={user.id} open={open} onClose={() => setOpen(false)} articleId={articleId} locale={locale} />}
    <LazyToaster />
  </SessionContext.Provider>;
}

/** Session changes never redirect the reader away from the documentation. */
export function DocumentationSession({ children, locale }: { children: ReactNode; locale: Locale }) {
  const config = useRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return children;
  return <AuthProvider><AccountQueryProvider><Session locale={locale}>{children}</Session></AccountQueryProvider></AuthProvider>;
}

export function DocumentationAccountActions({ currentId, locale }: { currentId: string | null; locale: Locale }) {
  const auth = useAuthOptional();
  if (!auth) return <DocumentationGuestActions currentId={currentId} locale={locale} />;
  return <SessionAccountActions currentId={currentId} locale={locale} />;
}

function DocumentationGuestActions({ currentId, locale }: { currentId: string | null; locale: Locale }) {
  const t = useTranslations("Documentation");
  const auth = useTranslations("Auth");
  const destination = documentationPath(currentId, locale);
  const preservePosition = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const target = new URL(event.currentTarget.href);
    target.searchParams.set("redirect", window.location.pathname + window.location.search + window.location.hash);
    event.currentTarget.href = target.toString();
  };
  return <div className="flex items-center gap-1 sm:gap-2">
    <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3"><a href={`/login?redirect=${encodeURIComponent(destination)}`} onClick={preservePosition}>{auth("signIn")}</a></Button>
    <Button asChild size="sm" className="px-2 sm:px-3"><a href={`/signup?redirect=${encodeURIComponent(destination)}`} onClick={preservePosition}>{t("signUp")}</a></Button>
  </div>;
}

function SessionAccountActions({ currentId, locale }: { currentId: string | null; locale: Locale }) {
  const session = useContext(SessionContext)!;
  const { user, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const avatar = useMyAvatarSource();
  const t = useTranslations("Documentation");
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
      toast.error(t("signOutFailed"));
    }
  };
  useEffect(() => session.setArticleId(currentId), [currentId, session.setArticleId]);
  if (loading) return <div aria-busy="true" className="h-9 w-24 animate-pulse rounded bg-muted" />;
  if (!user) return <DocumentationGuestActions currentId={currentId} locale={locale} />;
  return <div className="flex items-center gap-2">
    <Button variant="ghost" size="sm" aria-expanded={session.open} aria-controls="documentation-numo" onClick={() => session.setOpen(!session.open)} data-documentation-numo-launcher>
      <NumoFace className="size-5" />{t("help")}
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("account")} className="size-11 rounded-full"><UserAvatar seed={avatar} className="size-8" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href="/home"><HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden />{t("openApp")}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={signingOut} onSelect={() => { void handleSignOut(); }}><HugeiconsIcon icon={LogOutIcon} aria-hidden />{t("signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
