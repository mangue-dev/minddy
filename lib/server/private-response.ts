import "server-only";

/** Keep user-private traffic out of browser, proxy, and CDN caches. */
export function preventPrivateCaching(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Apply the private response policy to every outcome, including auth errors. */
export function withPrivateNoStore<Args extends unknown[]>(
  handler: (...args: Args) => Response | Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args) => preventPrivateCaching(await handler(...args));
}
