import type { ReactNode } from "react";
import { getMessages } from "next-intl/server";
import { landingFigureMessages } from "@/lib/landing-figure-messages";
import { FigureClientScope } from "./figure-client-scope";

/**
 * Mounted once around a page whose figures are built from real app
 * components: it adds only the namespaces those components translate
 * (`lib/landing-figure-messages.ts`) and a query client. Once per page, so
 * the catalog crosses to the browser a single time.
 */
export async function FigureScope({ children }: { children: ReactNode }) {
  return (
    <FigureClientScope messages={landingFigureMessages(await getMessages())}>
      {children}
    </FigureClientScope>
  );
}
