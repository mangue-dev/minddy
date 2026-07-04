"use client";

import { AuthProvider } from "@/lib/auth-context";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
        {children}
      </div>
    </AuthProvider>
  );
}
