/** All callers share the folder dialog and startup until that selection settles. */
export function createLocalStartupSelection<Result>(start: () => Promise<Result>) {
  let pending: Promise<Result> | null = null;
  const run = (operation: typeof start) => {
    if (!pending) pending = Promise.resolve().then(operation).finally(() => { pending = null; });
    return pending;
  };
  return Object.assign(() => run(start), { run });
}
