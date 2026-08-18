// `lucide-react` replaced by a no-op in the projection bundle (MIN-295).
//
// Each block descriptor (components/pages/blocks/*.ts) carries its icon
// menu entry “/”. This is data from the PUBLISHER: markdown projection
// mount the same register, but in `headless` — it has no menu, no rendering, no
// React. The import nevertheless took out the entire package, i.e. 971 KB of traces
// SVG and the React development build, cold loaded into the function
// to never be read.
//
// The proxy makes a component inert for any name: the descriptor
// keep a `icon` defined (no one dereferences it here, but a `undefined`
// would be one more difference between the two montages), and a new import
// icon in a block does not break this bundle.
const Icon = () => null;
Icon.displayName = "LucideIconStub";

module.exports = new Proxy(
  { __esModule: true, default: Icon },
  { get: (target, key) => (key in target ? target[key] : Icon) },
);
