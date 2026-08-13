/**
 * Storefront layout registry (CLAUDE.md §10.1, §12.2).
 *
 * One entry per shape the filters can take on a collection or search page.
 * The `value` is what lands in `AppSettings.general.defaultLayout`, in the
 * theme block's `desktop_layout` setting, and in the `.scfs-app--<value>`
 * class the extension stylesheet keys off — so the three cannot drift.
 */

import type { Layout, MobileLayout } from "../lib/validation";

export interface LayoutDefinition<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const DESKTOP_LAYOUT_DEFINITIONS: LayoutDefinition<Layout>[] = [
  {
    value: "sidebar",
    label: "Default — left side",
    description:
      "Filters in a column beside the products. The most familiar arrangement and the best fit for long value lists.",
  },
  {
    value: "offcanvas",
    label: "Off canvas — left side",
    description:
      "A Filter button opens the filters over the page. Gives the product grid the full width.",
  },
  {
    value: "collapsed",
    label: "Collapsed — expand",
    description:
      "Filters stay closed until a shopper asks for them, then slide in. Useful when most visitors browse rather than filter.",
  },
  {
    value: "columns_1",
    label: "One column per filter option",
    description: "Filters run across the top of the results, one per row.",
  },
  {
    value: "columns_2",
    label: "Two columns per filter option",
    description: "Filters run across the top of the results in two columns.",
  },
  {
    value: "columns_3",
    label: "Three columns per filter option",
    description: "Filters run across the top of the results in three columns.",
  },
  {
    value: "show_all",
    label: "Show all filter options",
    description:
      "Every filter is open above the results with no collapsing. Best for a small, curated set of filters.",
  },
];

export const MOBILE_LAYOUT_DEFINITIONS: LayoutDefinition<MobileLayout>[] = [
  {
    value: "drawer",
    label: "Filter button — off canvas",
    description: "A Filter button opens a drawer that slides in from the side.",
  },
  {
    value: "fullscreen",
    label: "Filter button — full screen",
    description: "A Filter button opens the filters over the whole screen.",
  },
  {
    value: "inline",
    label: "Filters above results",
    description:
      "No button: the filters sit in the page above the products, collapsed into accordions.",
  },
];

/** Layouts whose filter panel is summoned rather than always on screen. */
export const DRAWER_LAYOUTS: readonly Layout[] = ["offcanvas", "collapsed"];

export function isDrawerLayout(layout: string): boolean {
  return (DRAWER_LAYOUTS as readonly string[]).includes(layout);
}
