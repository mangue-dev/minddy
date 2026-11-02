"use client";

import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMessages, type AbstractIntlMessages } from "next-intl";
import { InheritedIntlProvider } from "@/components/browser-intl-provider";

/**
 * Client half of `FigureScope`. It adds the figures' namespaces to the
 * catalog the page already has rather than replacing it, so the public
 * namespaces are not sent twice. The query client never fetches: figure data
 * is static, and a few card pieces only need a provider above them.
 */
export function FigureClientScope({
  messages,
  children,
}: {
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  const inherited = useMessages();
  const merged = useMemo(() => ({ ...inherited, ...messages }), [inherited, messages]);
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }),
  );
  return (
    <InheritedIntlProvider messages={merged}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </InheritedIntlProvider>
  );
}
