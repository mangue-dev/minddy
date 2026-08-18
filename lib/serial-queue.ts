/**
 * A queue that places asynchronous tasks END TO END: the next one only starts
 * once the previous one has been dropped, whether successful or not.
 *
 * What is it for, very concretely: two detached writes launched at one
 * second interval are not necessarily executed in that order. A DELETE
 * then a PUT gone in the right order can arrive in the wrong — two
 * connections, two server-side schedules — and the DELETE wins.
 * Numo's conversation pointer (MIN-353) has exactly this form:
 * "new conversation" deletes, the first message written. Reversed, the base
 * no longer has a pointer while the thread is alive and well.
 *
 * Serializing is the only remedy that works: ignoring the RESPONSE of an expired write
 * does not change anything, the server has already applied it. The second
 * request must only be sent after the first has finished being processed.
 *
 * A failed task does not break the queue: the chain continues on the
 * `catch`, otherwise an unprocessed rejection would take away everything that follows.
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
