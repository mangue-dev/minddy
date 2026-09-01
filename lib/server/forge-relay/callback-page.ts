import "server-only";

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Renders the small relay callback page without accepting an HTML fragment. */
export function relayCallbackPage(input: {
  title: string;
  detail: string;
  status: number;
  returnUrl?: URL;
}): Response {
  const title = escapeHtmlText(input.title);
  const detail = escapeHtmlText(input.detail);
  const returnUrl = input.returnUrl ? escapeHtmlText(input.returnUrl.toString()) : null;
  const continuation = returnUrl
    ? `<p><a href="${returnUrl}">Continue if nothing happens.</a></p>
       <meta http-equiv="refresh" content="1;url=${returnUrl}">`
    : "";
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
      <h1>${title}</h1><p>${detail}</p>${continuation}
    </body></html>`,
    { status: input.status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
