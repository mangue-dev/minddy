import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import {
  assertPublicHttpUrl,
  isPrivateAddress,
  requestPublicUrl,
} from "../deploy/self-hosted/agent-runner-egress.mjs";

function upstreamResponse(status, headers = {}) {
  const stream = Readable.from([]);
  return {
    status,
    headers: new Headers(headers),
    stream,
    destroy: () => stream.destroy(),
  };
}

test("the relay address filter blocks private and disguised private destinations", () => {
  for (const address of [
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "::1",
    "fd00::1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe",
    "2606:4700::5efe:a9fe:a9fe",
    "2606:4700:1:2:200:5efe:a00:1",
    "2002:a9fe:a9fe::1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
  assert.equal(isPrivateAddress("2606:4700::5efe:5db8:d822"), false);
});

test("the relay rejects a direct private URL and a mixed public-private DNS answer", async () => {
  await assert.rejects(
    assertPublicHttpUrl("http://169.254.169.254/latest/meta-data"),
    (error) => error.reason === "url",
  );
  await assert.rejects(
    assertPublicHttpUrl("https://rebind.example/v1", async () => [
      { address: "1.1.1.1" },
      { address: "127.0.0.1" },
    ]),
    (error) => error.reason === "url",
  );
});

test("the relay validates a private redirect before opening the next connection", async () => {
  const calls = [];
  const request = async (target, options) => {
    calls.push({ target, options });
    return upstreamResponse(307, { location: "http://169.254.169.254/latest/meta-data" });
  };

  await assert.rejects(
    requestPublicUrl("https://provider.example/v1/chat/completions", {
      method: "POST",
      body: "{}",
    }, {
      lookup: async () => [{ address: "1.1.1.1" }],
      request,
    }),
    (error) => error.reason === "url",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target.address, "1.1.1.1");
});

test("the relay rejects a redirect with a mixed public-private DNS answer", async () => {
  let requestCount = 0;
  const lookup = async (host) => host === "provider.example"
    ? [{ address: "1.1.1.1" }]
    : [{ address: "8.8.8.8" }, { address: "10.0.0.8" }];

  await assert.rejects(
    requestPublicUrl("https://provider.example/v1/chat/completions", {
      method: "POST",
      body: "{}",
    }, {
      lookup,
      request: async () => {
        requestCount++;
        return upstreamResponse(307, { location: "https://rebind.example/completions" });
      },
    }),
    (error) => error.reason === "url",
  );
  assert.equal(requestCount, 1);
});

test("the relay revalidates and pins every public redirect hop", async () => {
  const addresses = {
    "provider.example": "1.1.1.1",
    "edge.example": "8.8.8.8",
    "region.example": "9.9.9.9",
  };
  const calls = [];
  const responses = [
    upstreamResponse(307, { location: "https://edge.example/completions" }),
    upstreamResponse(307, { location: "https://region.example/completions" }),
    upstreamResponse(200),
  ];

  const result = await requestPublicUrl("https://provider.example/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer provider-secret", "content-type": "application/json" },
    body: "{}",
  }, {
    lookup: async (host) => [{ address: addresses[host] }],
    request: async (target, options) => {
      calls.push({ target, options });
      return responses.shift();
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.map(({ target }) => target.address), ["1.1.1.1", "8.8.8.8", "9.9.9.9"]);
  assert.equal(calls[0].options.headers.authorization, "Bearer provider-secret");
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert.equal(calls[2].options.headers.authorization, undefined);
});
