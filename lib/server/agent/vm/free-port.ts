import { createServer } from "node:net";

/**
 * A FREE PORT, REQUESTED FROM THE SYSTEM (MIN-354).
 *
 * The harness opened two sockets on hard-written numbers: 4096 for
 * `opencode serve`, 4097 for the tools bridge. In a microVM created for a single run, nothing else is listening and the choice costs nothing. On a computer,
 * the two hypotheses fall at once: a developer can already hold 4096,
 * and above all **two simultaneous runs would compete for the same two ports** - the
 * second would die on a refused `listen`, in a place which in no way resembles
 * its cause.
 *
 * We therefore ask the kernel for the port (`listen(0)`), we read it, and we release. There
 * remains a window between this release and the `listen` of the real server: this is
 * the known limit of this gesture, and it is acceptable because no other
 * means exists for a process that we do not control — `opencode serve` wants
 * a port number as an argument, it does not know how to inherit from a socket already
 * open. The tools bridge knows how to listen on `0` directly, and this is what it does ([tool-bridge.ts](tool-bridge.ts)).
 *
 * `127.0.0.1` * explicitly, never `0.0.0.0`: this that we reserve here has no reason to be reachable from the machine's network, and a local loop port only argues with processes on the same host.
 */
export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not read the reserved port")));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}
