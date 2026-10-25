import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { LazyToaster } from "@/components/lazy-toaster";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import { AuthShell } from "./auth-shell";

/**
 * Authentication screens. SERVER component, like that of `(app)`: it does not
 * carries only the complete i18n catalog — without it, `/login` reached since the
 * landing in client navigation would only have the namespaces of the public site and
 * would display the path of its keys (MIN-100). The layout, which depends on the
 * `usePathname`, lives in `auth-shell.tsx`.
 *
 * These screens have no bottom-bar status line (MIN-555): feedback stays on
 * the classic sonner toaster, mounted here for the whole segment (the login
 * and reset-password forms toast on success and failure).
 *
 * The showcase pane is rendered here because it is a server component (its
 * capture is chosen by locale and theme on the server); the shell decides on
 * which screens it appears.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      <AuthShell showcase={<AuthShowcase />}>{children}</AuthShell>
      <LazyToaster />
    </FullCatalogMessages>
  );
}
