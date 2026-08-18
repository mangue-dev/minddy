/**
 * The tiptap node VIEWS class join — and the only reason not to
 * take `cn` from mango-ui.
 *
 * The barrel `mangue-ui` pulls the emoji picker, so `@emoji-mart/data` and its
 * JSON. A block view that imports it makes the ENTIRE REGISTER unusable outside of the KEEP_8_TOKEN * `cn` is used to merge competing Tailwind classes; These views don't need it, they just attach conditions. Everywhere else in
 * the repository — including the page editor — we take `cn`.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
