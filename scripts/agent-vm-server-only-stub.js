// `server-only` replaced by a no-op in the microVM bundle (MIN-224).
//
// The real LEVEL package when imported outside of a React server context, this
// which is exactly the case of the microVM: it runs bare Node. None
// bundle module should not import it — the sorting has been done, and the test
// graph keeps it — but a forgotten import must result in an inert module,
// not by a harness that refuses to start.
module.exports = {};
