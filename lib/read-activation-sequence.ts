let sequence = 0;

/** Persisted reads from an earlier page load cannot authorize this session. */
export const readActivationSession = crypto.randomUUID();

/** Order read starts and view activations independently of wall-clock changes. */
export function nextReadActivationSequence(): number {
  return ++sequence;
}
