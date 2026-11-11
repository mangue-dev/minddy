/**
 * The HORIZONTAL tabs of the product, tightened.
 *
 * The `Tabs` primitive draws a SCREEN tab bar: 40 px high in `line`,
 * `px-4` per tab, and one `flex-1` which stretches them all to the same width — in
 * a `w-full` list, two labels take up half a column each. Our
 * tabs live IN a column, above content that begins
 * just below: the panel of a ticket, the details of a pull request,
 * the history of a page, the composition of a comment. At this scale, stretched tabs read like buttons, not tabs.
 *
 * The two classes go together: each tab at the size of its label, and
 * the row at the height of a row.
 *
 * On a phone the column is the screen: the tabs share its width, as a
 * segmented control does, each one an easy target.
 */
export const TAB_LIST_DENSE = "h-9 justify-start app-mobile:h-11 app-mobile:w-full app-mobile:translate-x-0!";
export const TAB_TRIGGER_DENSE = "flex-none px-3 app-mobile:flex-1";
