"use client";

import { AuthProvider } from "@/lib/auth-context";
import { AppQueryProvider } from "@/lib/query-provider";
import { ProjectsProvider } from "@/lib/projects-context";
import { AppShellChrome } from "@/components/app-shell-chrome";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppQueryProvider>
        <ProjectsProvider>
          <AppShellChrome>{children}</AppShellChrome>
        </ProjectsProvider>
      </AppQueryProvider>
    </AuthProvider>
  );
}
