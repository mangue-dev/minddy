export const WINDOWS_STORE_ARTIFACT_PATTERN = /-windows-(?:x64|arm64)-store\.msix$/i;
export const WINDOWS_STORE_IDENTITY = Object.freeze({
  name: "mangue-dev.minddy",
  publisher: "CN=D5052B10-735B-4EF0-920F-642DFBDEB04F",
  publisherDisplayName: "mangue-dev",
});

/** Prevents a mistyped GitHub variable from creating an unsubmitable package. */
export function requireWindowsStoreIdentity(name, publisher) {
  if (name !== WINDOWS_STORE_IDENTITY.name) {
    throw new Error(`Windows Store identity name must be ${WINDOWS_STORE_IDENTITY.name}`);
  }
  if (publisher !== WINDOWS_STORE_IDENTITY.publisher) {
    throw new Error(`Windows Store publisher must be ${WINDOWS_STORE_IDENTITY.publisher}`);
  }
}

/** Requires one Store package per supported architecture. */
export function requireWindowsStoreArtifacts(entries) {
  const packages = entries.filter((name) => WINDOWS_STORE_ARTIFACT_PATTERN.test(name)).sort();
  for (const arch of ["x64", "arm64"]) {
    if (!packages.some((name) => name.includes(`-windows-${arch}-store.msix`))) {
      throw new Error(`Windows Store release is missing its ${arch} MSIX package`);
    }
  }
  if (packages.length !== 2) {
    throw new Error(`Windows Store release must contain exactly two MSIX packages, found ${packages.length}`);
  }
  return packages;
}
