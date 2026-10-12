/** All callers share the folder dialog and startup until that selection settles. */
export function createLocalStartupSelection(start: () => Promise<{ error?: string }>) {
  let pending: Promise<{ error?: string }> | null = null;
  const run = (operation: typeof start) => {
    if (!pending) pending = Promise.resolve().then(operation).finally(() => { pending = null; });
    return pending;
  };
  return Object.assign(() => run(start), { run });
}
