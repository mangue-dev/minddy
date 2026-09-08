import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection, createServer } from "node:net";
import test from "node:test";
import { createDatabaseProxy } from "../deploy/self-hosted/database-proxy.mjs";

test("the maintenance bridge preserves large responses after a client half-close", async (t) => {
  const payload = Buffer.alloc(2 * 1024 * 1024, 97);
  const backend = createServer({ allowHalfOpen: true }, (socket) => {
    socket.resume();
    socket.on("end", () => socket.end(payload));
  }).listen(0, "127.0.0.1");
  await once(backend, "listening");
  t.after(() => backend.close());
  const proxy = createDatabaseProxy({ host: "127.0.0.1", port: backend.address().port }).listen(0, "127.0.0.1");
  await once(proxy, "listening");
  t.after(() => proxy.close());
  const client = createConnection({ host: "127.0.0.1", port: proxy.address().port });
  client.end("request");
  const chunks = [];
  for await (const chunk of client) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), payload);
});

test("an unavailable database closes the connection without stopping the listener", async (t) => {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const proxy = createDatabaseProxy({ host: "127.0.0.1", port }).listen(0, "127.0.0.1");
  await once(proxy, "listening");
  t.after(() => proxy.close());
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = createConnection({ host: "127.0.0.1", port: proxy.address().port });
    client.on("error", () => {});
    client.resume();
    await new Promise((resolve) => client.on("close", resolve));
    assert.equal(proxy.listening, true);
  }
});
