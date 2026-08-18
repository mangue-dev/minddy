import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { AuthShell } from "./auth-shell";

/**
 * Authentication screens. SERVER component, like that of `(app)`: it does not
 * carries only the complete i18n catalog — without it, `/login` reached since the
 * landing in client navigation would only have the namespaces of the public site and
 * would display the path of its keys (MIN-100). The layout, which depends on the
 * `usePathname`, lives in `auth-shell.tsx`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      <AuthShell>{children}</AuthShell>
    </FullCatalogMessages>
  );
}
