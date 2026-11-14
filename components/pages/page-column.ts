/**
 * The column of a wiki page (MIN-983). Its gutters sit INSIDE the column: on
 * desktop the left one (96px) holds the block handle and its `+`, the right
 * one the hovered block's comment button. The text keeps the page content
 * width every centred page shares (`--content-width`), so each column is that
 * width plus its own gutters.
 *
 * On a page the two gutters are equal (`px-24`, 12rem in all): the text then
 * sits in the middle of the pane, at the same place as the content of every
 * other centred page. With a narrower right gutter (the comment button only
 * needs 40px) the text stood off-centre, 28px to the right. On a phone the
 * gutters are 1.5rem a side; in the side panel `px-16` (8rem), and
 * `pl-24 pr-16` (10rem) for a database there. A database page outside the
 * panel spans the pane and keeps no width.
 *
 * The class strings stay literal: Tailwind only generates what it reads.
 */
export const PAGE_COLUMN = {
  document:
    "max-w-[calc(var(--content-width)+3rem)] app-desktop:max-w-[calc(var(--content-width)+12rem)] app-desktop:px-24",
  panelDocument:
    "max-w-[calc(var(--content-width)+3rem)] app-desktop:max-w-[calc(var(--content-width)+8rem)] app-desktop:px-16",
  panelDatabase:
    "max-w-[calc(var(--content-width)+3rem)] app-desktop:max-w-[calc(var(--content-width)+10rem)] app-desktop:pl-24 app-desktop:pr-16",
  database: "max-w-none app-desktop:pl-24 app-desktop:pr-10",
} as const;
