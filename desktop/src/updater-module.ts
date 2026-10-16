import type { AppUpdater } from "electron-updater";

/**
 * Loads `electron-updater` and reads its `autoUpdater`, at the moment of the
 * call and never before.
 *
 * ⚠ A `require` in a function, and on purpose:
 *
 * - the package is external to the bundle (scripts/build-desktop.mjs), so a
 *   static import becomes a module-scope `require` of about 160 files (all
 *   six updaters, fs-extra, js-yaml, semver…) evaluated before `ready`, on
 *   every launch, including unpackaged runs that never update;
 * - a dynamic `import()` of an external stays a native import in the bundle,
 *   and Node's ESM loader cannot see `autoUpdater` among the named exports:
 *   the package defines it with a computed getter;
 * - `autoUpdater` itself is a lazy getter whose constructor calls
 *   `app.getVersion()`: it must not be read before Electron is ready. The
 *   package declares `__esModule: true` without a `default` export, so read
 *   the named property, never `default`.
 */
export function requireAutoUpdater(): AppUpdater {
  const updater = require("electron-updater") as typeof import("electron-updater");
  return updater.autoUpdater;
}
