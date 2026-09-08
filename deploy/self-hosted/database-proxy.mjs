import { createConnection, createServer } from "node:net";
import { pathToFileURL } from "node:url";

// PostgreSQL and Kong stay on their internal network. Docker publishes these
// listeners on host loopback only, for authenticated bootstrap and maintenance.
export function createDatabaseProxy({ host = "db", port = 5432 } = {}) {
  const server = createServer({ allowHalfOpen: true }, (client) => {
    const upstream = createConnection({ host, port, allowHalfOpen: true });
    upstream.setTimeout(10_000, () => upstream.destroy());
    upstream.once("connect", () => upstream.setTimeout(0));
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => { if (!upstream.readableEnded) client.destroy(); });
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.maxConnections = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createDatabaseProxy().listen(5432, "0.0.0.0");
  createDatabaseProxy({ host: "kong", port: 8000 }).listen(8000, "0.0.0.0");
}
