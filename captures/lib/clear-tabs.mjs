/**
 * captures/ — empties a capture account's synced tab strip.
 *
 * Every capture run opens routes, and the account keeps them as synced tabs:
 * after a few runs the strip of a full-window figure shows seven of them.
 * This closes all but one tab (the API refuses to close the last) through the
 * application's own endpoint, for the demo account or the capture admin.
 * Preview or a local candidate only, never production.
 *
 *   CAPTURE_BASE_URL=http://localhost:3000 node captures/lib/clear-tabs.mjs
 *   CAPTURE_BASE_URL=http://localhost:3000 node captures/lib/clear-tabs.mjs admin
 */
import { CAPTURE, openPage } from "./browser.mjs";
import { assertNonProductionOrigin } from "./database-target.mjs";

const session = process.argv[2] === "admin" ? "admin" : "demo";
assertNonProductionOrigin(CAPTURE.baseUrl, "the capture tab cleanup");

const { browser, page } = await openPage({ authed: true, session, locale: "en", theme: "light" });
try {
  const api = `${CAPTURE.baseUrl}/api/me/app-tabs`;
  const listed = await page.request.get(api);
  if (!listed.ok()) throw new Error(`captures: reading the tab strip failed (${listed.status()}); refresh the session.`);
  const tabs = await listed.json();
  let closed = 0;
  for (const tab of tabs.slice(0, -1)) {
    const response = await page.request.delete(`${api}/${tab.id}`, { data: { revision: tab.revision } });
    if (response.ok()) closed += 1;
  }
  console.log(`Closed ${closed} of ${tabs.length} synced tabs; ${tabs.length - closed} left.`);
} finally {
  await browser.close();
}
