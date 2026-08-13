"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import { DesktopAuthBridge } from "@/components/desktop-auth-bridge";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Login/signup possèdent leur propre mise en page pleine hauteur à deux
  // colonnes ; les écrans OAuth (consentement / succès) sont de simples cartes
  // centrées.
  const fullBleed = pathname === "/login" || pathname === "/signup";

  return (
    <AuthProvider>
      {/* Le retour du navigateur système, dans l'app de bureau (MIN-291). Ne
          rend rien hors de l'app, et rien tant qu'aucun lien n'arrive. */}
      <DesktopAuthBridge />
      {/* `auth-shell` : la seule prise de globals.css sur ces écrans — la bande
          par laquelle on déplace la fenêtre de l'app de bureau, faute d'en-tête
          où l'accrocher (MIN-291). Sans elle, la fenêtre est immobile tant qu'on
          n'est pas connecté. */}
      {fullBleed ? (
        <div className="auth-shell min-h-[100dvh] bg-background">{children}</div>
      ) : (
        <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-background p-6">
          {children}
        </div>
      )}
    </AuthProvider>
  );
}
