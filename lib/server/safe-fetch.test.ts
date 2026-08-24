import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-336 — the address filter is half of the anti-SSRF safeguard (the other
 * being connection pinning, see [pinned-request.ts](./pinned-request.ts)).
 * The dangerous inputs are rarely plain `10.0.0.1`; they are forms that
 * disguise a private address — hexadecimal IPv4 mappings, SIIT, 6to4, and
 * NAT64 — plus non-routable ranges that are easy to overlook.
 */

const pinnedRequest = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./pinned-request", () => ({ pinnedRequest }));

const { isPrivateAddress, SafeFetchError, safeFetch } = await import("./safe-fetch");

describe("isPrivateAddress — blocked", () => {
  it.each([
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "private"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local cloud metadata"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private range upper bound"],
    ["192.168.0.1", "private"],
    ["100.64.0.1", "CGNAT"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["192.0.2.7", "TEST-NET-1"],
    ["192.88.99.1", "former 6to4 relay"],
    ["198.18.0.1", "benchmark"],
    ["198.51.100.4", "TEST-NET-2"],
    ["203.0.113.9", "TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::", "unspecified"],
    ["::1", "loopback IPv6"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local range upper bound"],
    ["fc00::1", "ULA"],
    ["fd12:3456::1", "ULA"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["100::1", "discard"],
    ["::ffff:127.0.0.1", "IPv4-mapped dotted form"],
    ["::ffff:c0a8:1", "IPv4-mapped hexadecimal form — 192.168.0.1"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped — 169.254.169.254"],
    ["::7f00:1", "IPv4-compatible — 127.0.0.1"],
    ["::ffff:0:169.254.169.254", "IPv4-translated dotted form"],
    ["::ffff:0:a9fe:a9fe", "IPv4-translated hexadecimal form"],
    ["64:ff9b::a00:1", "NAT64 — 10.0.0.1"],
    ["64:ff9b:1:a9fe:a9:fe00::", "local-use translation — 169.254.169.254"],
    ["2002:a9fe:a9fe::1", "6to4 — 169.254.169.254"],
    ["fe80::1%eth0", "link-local with a zone identifier"],
    // MIN-341 — the forgotten ranges, and the old writings of an IPv4.
    ["192.31.196.1", "AS112"],
    ["192.52.193.1", "AMT"],
    ["192.175.48.1", "AS112 direct delegation"],
    ["240.0.0.1", "reserved"],
    ["2001::1", "Teredo, which carries two IPv4 addresses"],
    ["2001:20::1", "ORCHIDv2"],
    ["3fff::1", "modern documentation range"],
    ["2130706433", "127.0.0.1 in decimal"],
    ["0177.0.0.1", "127.0.0.1 in octal"],
    ["0x7f.0.0.1", "127.0.0.1 in hexadecimal"],
    ["127.1", "127.0.0.1 in short form"],
    ["2852039166", "169.254.169.254 in decimal"],
    ["0xa9fea9fe", "169.254.169.254 in hexadecimal"],
  ])("blocks %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
});

describe("isPrivateAddress — allowed", () => {
  it.each([
    ["93.184.216.34", "example.com"],
    ["1.1.1.1", "public resolver"],
    ["172.15.0.1", "immediately below the private /12"],
    ["172.32.0.1", "immediately above the private /12"],
    ["100.63.0.1", "immediately below CGNAT"],
    ["100.128.0.1", "immediately above CGNAT"],
    ["223.255.255.255", "last IPv4 unicast address"],
    ["2606:4700::1111", "Cloudflare"],
    ["2001:4860:4860::8888", "Google Public DNS"],
    ["::ffff:5db8:d822", "public IPv4-mapped — 93.184.216.34"],
    ["::ffff:0:5db8:d822", "public IPv4-translated — 93.184.216.34"],
    ["64:ff9b::5db8:d822", "public NAT64 payload — 93.184.216.34"],
    ["2002:5db8:d822::1", "6to4 over a public IPv4 address"],
    ["1568489506", "93.184.216.34 in decimal — a legacy form remains valid"],
    ["example.com", "a hostname is not an address"],
    ["0x", "not an address either"],
  ])("allows %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

/**
 * MIN-341 — the outgoing webhook is the first caller to POST via this path.
 * The payload must leave once for the validated destination, and a redirect
 * must not replay it elsewhere. Replaying a signed body after a 302 to a host
 * the owner did not choose would leak the webhook payload.
 */
describe("safeFetch — POST", () => {
  const stream = () => Readable.from([Buffer.from("")]);

  beforeEach(() => pinnedRequest.mockReset());

  it("passes the method, body, and byte length", async () => {
    pinnedRequest.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      stream: stream(),
      destroy: () => {},
    });
    const response = await safeFetch("https://93.184.216.34/hook", {
      method: "POST",
      body: '{"event":"issue.created ✅"}',
      headers: { "content-type": "application/json" },
      maxBytes: 1024,
      maxRedirects: 0,
    });
    expect(response.ok).toBe(true);
    const [, options] = pinnedRequest.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBe('{"event":"issue.created ✅"}');
    // The byte length includes the multi-byte check mark.
    expect(options.headers["content-length"]).toBe("29");
  });

  it("does not follow a redirect when redirects are disabled", async () => {
    pinnedRequest.mockResolvedValue({
      status: 302,
      headers: new Headers({ location: "http://169.254.169.254/" }),
      stream: stream(),
      destroy: () => {},
    });
    await expect(
      safeFetch("https://93.184.216.34/hook", {
        method: "POST",
        body: "{}",
        maxBytes: 1024,
        maxRedirects: 0,
      })
    ).rejects.toBeInstanceOf(SafeFetchError);
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects an IPv4-translated private literal before connecting", async () => {
    await expect(
      safeFetch("http://[::ffff:0:a9fe:a9fe]/", {
        maxBytes: 1024,
        maxRedirects: 0,
      })
    ).rejects.toEqual(new SafeFetchError("url"));
    expect(pinnedRequest).not.toHaveBeenCalled();
  });
});
