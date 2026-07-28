"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Login/signup possèdent leur propre mise en page pleine hauteur à deux
  // colonnes ; les écrans OAuth (consentement / succès) sont de simples cartes
  // centrées.
  const fullBleed = pathname === "/login" || pathname === "/signup";

  return (
    <AuthProvider>
      {fullBleed ? (
        <div className="min-h-[100dvh] bg-background">{children}</div>
      ) : (
        <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
          {children}
        </div>
      )}
    </AuthProvider>
  );
}
