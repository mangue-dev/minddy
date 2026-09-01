import "server-only";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Renders the small relay callback page without accepting an HTML fragment. */
export function relayCallbackPage(input: {
  title: string;
  detail: string;
  status: number;
  returnUrl?: URL;
}): Response {
  const returnUrl = input.returnUrl?.toString();
  const document = createElement(
    "html",
    null,
    createElement(
      "body",
      { style: { fontFamily: "system-ui", maxWidth: "32rem", margin: "4rem auto" } },
      createElement("h1", null, input.title),
      createElement("p", null, input.detail),
      returnUrl
        ? createElement(
            "p",
            null,
            createElement("a", { href: returnUrl }, "Continue if nothing happens."),
          )
        : null,
      returnUrl
        ? createElement("meta", { httpEquiv: "refresh", content: `1;url=${returnUrl}` })
        : null,
    ),
  );
  return new Response(
    `<!doctype html>${renderToStaticMarkup(document)}`,
    { status: input.status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
