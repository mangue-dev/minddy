import type { ReactNode } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { buildBoardAccentCss } from "@/lib/feedback/accent";
import { getBoardContext } from "@/lib/server/feedback/board-context";

/**
 * Layout du site public de feedback (MIN-59). Il injecte l'accent optionnel
 * choisi par l'owner, et sert au board le catalogue i18n complet — le root
 * layout ne diffuse que les namespaces du site marketing (MIN-100), et le board
 * est une vraie application cliente. Il lit le board par token (getter mis
 * en cache, partagé avec la page → une seule lecture DB) et, si un accent est
 * défini, pose un `<style>` server-rendered qui override --primary/--brand/--ring
 * avant le premier paint. Sans accent, il n'ajoute rien. Le thème light/dark
 * lui-même reste géré par le root layout (MIN-60).
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
