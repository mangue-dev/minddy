import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-336 — le filtre d'adresses est la moitié du garde-fou anti-SSRF (l'autre
 * étant l'épinglage de la connexion, voir [pinned-request.ts](./pinned-request.ts)).
 * Ce qui le met en défaut n'est presque jamais `10.0.0.1` : ce sont les formes
 * qui rhabillent une adresse privée — IPv4 mappée en hexadécimal, 6to4, NAT64 —
 * et les plages non routables qu'on oublie d'écrire.
 */

const pinnedRequest = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./pinned-request", () => ({ pinnedRequest }));

const { isPrivateAddress, SafeFetchError, safeFetch } = await import("./safe-fetch");

describe("isPrivateAddress — refusé", () => {
  it.each([
    ["0.0.0.0", "ce réseau"],
    ["10.1.2.3", "privé"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "lien-local, le métadonnées cloud"],
    ["172.16.0.1", "privé"],
    ["172.31.255.255", "privé, dernière adresse"],
    ["192.168.0.1", "privé"],
    ["100.64.0.1", "CGNAT"],
    ["192.0.0.1", "assignations IETF"],
    ["192.0.2.7", "TEST-NET-1"],
    ["192.88.99.1", "ancien relais 6to4"],
    ["198.18.0.1", "benchmark"],
    ["198.51.100.4", "TEST-NET-2"],
    ["203.0.113.9", "TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::", "non spécifiée"],
    ["::1", "loopback IPv6"],
    ["fe80::1", "lien-local"],
    ["febf::1", "lien-local, haut de la plage"],
    ["fc00::1", "ULA"],
    ["fd12:3456::1", "ULA"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["100::1", "discard"],
    ["::ffff:127.0.0.1", "IPv4 mappée, forme pointée"],
    ["::ffff:c0a8:1", "IPv4 mappée, forme hexadécimale — 192.168.0.1"],
    ["::ffff:a9fe:a9fe", "IPv4 mappée — 169.254.169.254"],
    ["::7f00:1", "IPv4 compatible — 127.0.0.1"],
    ["64:ff9b::a00:1", "NAT64 — 10.0.0.1"],
    ["2002:a9fe:a9fe::1", "6to4 — 169.254.169.254"],
    ["fe80::1%eth0", "lien-local avec sa zone"],
    // MIN-341 — les plages oubliées, et les écritures anciennes d'une IPv4.
    ["192.31.196.1", "AS112"],
    ["192.52.193.1", "AMT"],
    ["192.175.48.1", "AS112, délégation directe"],
    ["240.0.0.1", "réservé"],
    ["2001::1", "Teredo, qui transporte deux IPv4"],
    ["2001:20::1", "ORCHIDv2"],
    ["3fff::1", "documentation moderne"],
    ["2130706433", "127.0.0.1 en décimal"],
    ["0177.0.0.1", "127.0.0.1 en octal"],
    ["0x7f.0.0.1", "127.0.0.1 en hexadécimal"],
    ["127.1", "127.0.0.1 en forme courte"],
    ["2852039166", "169.254.169.254 en décimal"],
    ["0xa9fea9fe", "169.254.169.254 en hexadécimal"],
  ])("refuse %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
});

describe("isPrivateAddress — accepté", () => {
  it.each([
    ["93.184.216.34", "example.com"],
    ["1.1.1.1", "résolveur public"],
    ["172.15.0.1", "juste en dessous du /12 privé"],
    ["172.32.0.1", "juste au dessus"],
    ["100.63.0.1", "juste en dessous du CGNAT"],
    ["100.128.0.1", "juste au dessus"],
    ["223.255.255.255", "dernière adresse unicast"],
    ["2606:4700::1111", "Cloudflare"],
    ["::ffff:5db8:d822", "IPv4 mappée publique — 93.184.216.34"],
    ["2002:5db8:d822::1", "6to4 sur une IPv4 publique"],
    ["1568489506", "93.184.216.34 en décimal — une forme ancienne reste licite"],
    ["exemple.com", "un nom d'hôte n'est pas une adresse"],
    ["0x", "ni ça"],
  ])("accepte %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

/**
 * MIN-341 — le webhook sortant est le premier appelant à POSTER par ce chemin.
 * Ce qui compte alors : la charge part une fois, à la destination validée, et
 * une redirection ne la fait pas partir ailleurs — un 302 signé rejoué vers un
 * hôte que l'owner n'a pas choisi serait exactement la fuite qu'on ferme.
 */
describe("safeFetch — POST", () => {
  const stream = () => Readable.from([Buffer.from("")]);

  beforeEach(() => pinnedRequest.mockReset());

  it("passe la méthode, le corps et sa longueur", async () => {
    pinnedRequest.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      stream: stream(),
      destroy: () => {},
    });
    const response = await safeFetch("https://93.184.216.34/hook", {
      method: "POST",
      body: '{"événement":"issue.created"}',
      headers: { "content-type": "application/json" },
      maxBytes: 1024,
      maxRedirects: 0,
    });
    expect(response.ok).toBe(true);
    const [, options] = pinnedRequest.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.body).toBe('{"événement":"issue.created"}');
    // Des octets, pas des caractères : « événement » en pèse deux de plus.
    expect(options.headers["content-length"]).toBe("31");
  });

  it("ne suit pas la redirection quand elle est interdite", async () => {
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
});
