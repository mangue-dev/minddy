import "server-only";

type RelayCallbackPage = "github-failed" | "github-connected" | "gitlab-failed";

const CALLBACK_PAGES: Record<RelayCallbackPage, { title: string; detail: string }> = {
  "github-failed": {
    title: "GitHub authorization failed",
    detail: "Go back to your minddy instance and restart the authorization.",
  },
  "github-connected": {
    title: "GitHub connected",
    detail: "The installation is now bound to your minddy instance. You can close this page.",
  },
  "gitlab-failed": {
    title: "GitLab connection failed",
    detail: "Go back to your minddy instance and restart the connection.",
  },
};

/** Renders a relay callback page from a closed set of static documents. */
export function relayCallbackPage(page: RelayCallbackPage, status: number): Response {
  const copy = CALLBACK_PAGES[page];
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
      <h1>${copy.title}</h1><p>${copy.detail}</p>
    </body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
