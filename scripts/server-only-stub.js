// `server-only` replaced by a no-op in the bundles built outside Next (the
// page-Markdown projection, scripts/build-pages-md.mjs).
//
// The real package throws when imported outside of a React server context,
// which is exactly the case of a bundle loaded by path from plain Node. A
// forgotten import must result in an inert module, not in a bundle that
// refuses to load.
module.exports = {};
