"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
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
import type { DocumentationArticle } from "@/lib/documentation";
import { DocumentationHelpContext, preserveDocumentationPosition } from "./documentation-help-context";
import { SELF_HOSTING_OVERVIEW, type SelfHostingHelpContext } from "@/lib/self-hosting-help-context";

type ArticleContext = { articleId: string | null; sections: DocumentationArticle["sections"] };
const DocumentationNumo = dynamic(() => import("./documentation-numo").then(m => m.DocumentationNumo), { ssr: false });

function Session({ children, locale, selfHosting }: { children: ReactNode; locale: Locale; selfHosting?: boolean }) {
  const user = useAuthOptional()?.user;
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const [article, setArticle] = useState<ArticleContext>({ articleId: null, sections: [] });
  const [wizard, setWizard] = useState<SelfHostingHelpContext | undefined>(selfHosting ? SELF_HOSTING_OVERVIEW : undefined);
  const changeOpen = (next: boolean) => { setOpen(next); if (next) setActivated(true); };
  return <DocumentationHelpContext.Provider value={{ open, setOpen: changeOpen, setArticle, setWizard }}>
    <div data-documentation-numo-open={open ? "true" : undefined}>{children}</div>
    {activated && <DocumentationNumo key={user?.id ?? "guest"} authenticated={!!user} open={open} onClose={() => setOpen(false)} {...article} wizard={wizard} locale={locale} />}
    <LazyToaster />
  </DocumentationHelpContext.Provider>;
}

/** Session changes never redirect the reader away from the documentation. */
export function DocumentationSession({ children, locale, selfHosting }: { children: ReactNode; locale: Locale; selfHosting?: boolean }) {
  const config = useRuntimeConfig();
  const session = <Session locale={locale} selfHosting={selfHosting}>{children}</Session>;
  if (!config.supabaseUrl || !config.supabaseAnonKey) return session;
  return <AuthProvider><AccountQueryProvider>{session}</AccountQueryProvider></AuthProvider>;
}

export function DocumentationAccountActions({ currentId, sections, locale }: { currentId: string | null; sections: DocumentationArticle["sections"]; locale: Locale }) {
  const auth = useAuthOptional();
  const session = useContext(DocumentationHelpContext);
  const t = useTranslations("Documentation");
  useEffect(() => session?.setArticle({ articleId: currentId, sections }), [currentId, sections, session?.setArticle]);
  return <div className="flex items-center gap-1 sm:gap-2">
    <Button variant="ghost" size="sm" aria-label={t("help")} aria-expanded={session?.open ?? false} aria-controls="documentation-numo" onClick={() => session?.setOpen(true)} data-documentation-numo-launcher className="min-h-11 min-w-11 px-2 sm:min-h-9 sm:min-w-0 sm:px-3">
      <NumoFace className="size-5" /><span className="hidden sm:inline">{t("help")}</span>
    </Button>
    {auth ? <SessionAccountActions currentId={currentId} locale={locale} /> : <DocumentationGuestActions currentId={currentId} locale={locale} />}
  </div>;
}

function DocumentationGuestActions({ currentId, locale }: { currentId: string | null; locale: Locale }) {
  const t = useTranslations("Documentation");
  const auth = useTranslations("Auth");
  const destination = documentationPath(currentId, locale);
  return <div className="flex items-center gap-1 sm:gap-2">
    <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3"><a href={`/login?redirect=${encodeURIComponent(destination)}`} onClick={preserveDocumentationPosition}>{auth("signIn")}</a></Button>
    <Button asChild size="sm" className="hidden px-2 sm:inline-flex sm:px-3"><a href={`/signup?redirect=${encodeURIComponent(destination)}`} onClick={preserveDocumentationPosition}>{t("signUp")}</a></Button>
  </div>;
}

function SessionAccountActions({ currentId, locale }: { currentId: string | null; locale: Locale }) {
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
  if (loading) return <div aria-busy="true" className="h-9 w-24 animate-pulse rounded bg-muted" />;
  if (!user) return <DocumentationGuestActions currentId={currentId} locale={locale} />;
  return <div className="flex items-center gap-2">
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
