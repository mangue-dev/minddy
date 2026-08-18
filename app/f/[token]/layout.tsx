import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { buildBoardAccentCss } from "@/lib/feedback/accent";
import { getBoardContext } from "@/lib/server/feedback/board-context";

/**
 * Layout for the public feedback site (MIN-59). It injects the optional accent
 * chosen by the owner, and serves the complete i18n catalog to the board — the root
 * layout only broadcasts the namespaces of the marketing site (MIN-100), and the board
 * is a real client application. It reads the board by token (getter memoized,
 * cached, shared with the page → a single DB read) and, if an accent is
 * defined, sets a `<style>` server-rendered which overrides --primary/--brand/--ring
 * before the first paint. Without an accent, it adds nothing. The light/dark theme
 * itself remains managed by the root layout (MIN-60).
 */
export default async function PublicFeedbackLayout({
  params,
  children,
}: {
  params: Promise<{ token: string }>;
  children: ReactNode;
}) {
  const { token } = await params;
  const ctx = await getBoardContext(token);
  const css = ctx ? buildBoardAccentCss(ctx.board.accent_light, ctx.board.accent_dark) : "";

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <FullCatalogMessages>{children}</FullCatalogMessages>
    </>
  );
}
