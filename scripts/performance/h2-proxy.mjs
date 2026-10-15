// Local production-like transport for performance runs: HTTP/2 over TLS with brotli,
// in front of `next start` (HTTP/1.1, uncompressed API JSON). Vercel serves HTTP/2 and
// compresses dynamic responses, so local HTTP/1.1 socket queueing and wire bytes are
// not representative. Usage: node scripts/performance/h2-proxy.mjs [listenPort] [upstreamPort]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import path from "node:path";
import zlib from "node:zlib";

const listenPort = Number(process.argv[2] ?? 3443);
const upstreamPort = Number(process.argv[3] ?? 3111);

// Hop-by-hop headers are invalid in HTTP/2 responses.
const HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "http2-settings"]);
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|x-javascript|manifest\+json|x-ndjson)|image\/svg\+xml)/;

export function shouldCompress(headers, acceptEncoding) {
  if (headers["content-encoding"]) return false;
  if (!/\bbr\b/.test(acceptEncoding ?? "")) return false;
  return COMPRESSIBLE.test(String(headers["content-type"] ?? ""));
}

function handle(req, res) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) if (!name.startsWith(":") && !HOP.has(name)) headers[name] = value;
  const authority = req.headers[":authority"] ?? req.headers.host ?? `localhost:${listenPort}`;
  Object.assign(headers, { host: authority, "x-forwarded-host": authority, "x-forwarded-proto": "https" });
  const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers }, (up) => {
    const out = {};
    for (const [name, value] of Object.entries(up.headers)) if (!HOP.has(name)) out[name] = value;
    const compress = shouldCompress(up.headers, req.headers["accept-encoding"]) && up.statusCode !== 204 && up.statusCode !== 304;
    if (compress) {
      delete out["content-length"];
      out["content-encoding"] = "br";
      out.vary = out.vary ? `${out.vary}, Accept-Encoding` : "Accept-Encoding";
    }
    res.writeHead(up.statusCode ?? 502, out);
    if (!compress) return up.pipe(res);
    // Flush per chunk so streamed RSC and NDJSON frames are not held back by the encoder.
    const brotli = zlib.createBrotliCompress({ flush: zlib.constants.BROTLI_OPERATION_FLUSH,
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
    up.pipe(brotli).pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  // Self-signed localhost certificate in the ignored output tree; clients ignore certificate errors.
  const certDir = path.resolve("output/playwright/performance/h2-proxy-cert");
  const keyPath = path.join(certDir, "key.pem"), certPath = path.join(certDir, "cert.pem");
  if (!existsSync(certPath)) {
    mkdirSync(certDir, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { stdio: "ignore" });
  }
  const server = http2.createSecureServer({ key: readFileSync(keyPath), cert: readFileSync(certPath), allowHTTP1: true }, handle);
  server.listen(listenPort, () => console.log(`h2 proxy https://localhost:${listenPort} -> http://127.0.0.1:${upstreamPort}`));
}
