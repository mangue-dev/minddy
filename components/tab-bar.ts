/**
 * The HORIZONTAL tabs of the product, tightened.
 *
 * mango-ui draws a SCREEN tab bar: 40 px high in `line`,
 * `px-4` per tab, and one `flex-1` which stretches them all to the same width — in
 * a `w-full` list, two labels take up half a column each. Our
 * tabs live IN a column, above content that begins
 * just below: the panel of a ticket, the details of a pull request,
 * the history of a page, the composition of a comment. At this scale, stretched tabs read like buttons, not tabs.
 *
 * The two classes go together: each tab at the size of its label, and
 * the row at the height of a row.
 */
export const TAB_LIST_DENSE = "h-9 justify-start";
export const TAB_TRIGGER_DENSE = "flex-none px-3";
