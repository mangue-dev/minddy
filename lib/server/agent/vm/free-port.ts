import { createServer } from "node:net";

/**
 * UN PORT LIBRE, DEMANDÉ AU SYSTÈME (MIN-354).
 *
 * Le harness ouvrait deux sockets sur des numéros écrits en dur : 4096 pour
 * `opencode serve`, 4097 pour le pont de tools. Dans une microVM créée pour un
 * seul run, rien d'autre n'écoute et le choix ne coûte rien. Sur un ordinateur,
 * les deux hypothèses tombent d'un coup : un développeur peut déjà tenir 4096,
 * et surtout **deux runs simultanés se disputeraient les mêmes deux ports** — le
 * second mourrait sur un `listen` refusé, à un endroit qui ne ressemble en rien
 * à sa cause.
 *
 * On demande donc le port au noyau (`listen(0)`), on le lit, et on relâche. Il
 * reste une fenêtre entre ce relâchement et le `listen` du vrai serveur : c'est
 * la limite connue de ce geste, et elle est acceptable parce qu'aucun autre
 * moyen n'existe pour un processus qu'on ne contrôle pas — `opencode serve` veut
 * un numéro de port en argument, il ne sait pas hériter d'une socket déjà
 * ouverte. Le pont de tools, lui, sait écouter sur `0` directement, et c'est ce
 * qu'il fait ([tool-bridge.ts](tool-bridge.ts)).
 *
 * `127.0.0.1` explicitement, jamais `0.0.0.0` : ce qu'on réserve ici n'a aucune
 * raison d'être joignable depuis le réseau de la machine, et un port de boucle
 * locale ne se dispute qu'avec les processus du même hôte.
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
