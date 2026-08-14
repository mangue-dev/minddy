/**
 * Une file qui met des tâches asynchrones BOUT À BOUT : la suivante ne démarre
 * qu'une fois la précédente retombée, réussie ou non.
 *
 * À quoi ça sert, très concrètement : deux écritures détachées lancées à une
 * seconde d'intervalle ne s'exécutent pas forcément dans cet ordre-là. Un DELETE
 * puis un PUT partis dans le bon ordre peuvent arriver dans le mauvais — deux
 * connexions, deux planifications côté serveur — et c'est le DELETE qui gagne.
 * Le pointeur de conversation de Numo (MIN-353) a exactement cette forme :
 * « nouvelle conversation » efface, le premier message écrit. Inversés, la base
 * n'a plus de pointeur alors que le fil, lui, est bien vivant.
 *
 * Sérialiser est le seul remède qui tienne : ignorer la RÉPONSE d'une écriture
 * périmée n'y change rien, le serveur l'a déjà appliquée. Il faut que la seconde
 * requête ne parte qu'après que la première a fini d'être traitée.
 *
 * Une tâche qui échoue ne casse pas la file : la chaîne se poursuit sur le
 * `catch`, sinon un rejet non traité emporterait tout ce qui suit.
 */
export type SerialQueue = (task: () => Promise<unknown>) => Promise<void>;

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();

  return (task) => {
    const next = tail.then(task).then(
      () => {},
      () => {},
    );
    tail = next;
    return next;
  };
}
