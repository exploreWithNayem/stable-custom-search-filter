/**
 * Starter filter set (CLAUDE.md §13.2).
 *
 * A shop with no filters falls back to Shopify's own facets, which is correct
 * but shows none of what the merchant installed this app for. These presets
 * build the set a storefront actually needs — the arrangement every catalogue
 * filter app converges on — in one action, so the first storefront load is
 * representative instead of empty.
 *
 * Option-backed presets carry a `matches` pattern and are skipped when the
 * catalogue has no such option, rather than creating a filter with no values.
 */

import type {
  FilterDisplayType,
  FilterSource,
} from "./filter-types";

export interface FilterPreset {
  name: string;
  source: FilterSource;
  displayType: FilterDisplayType;
  /**
   * Matched against the shop's product option names. Present means this is an
   * option filter: the first matching option becomes its `sourceKey`.
   */
  matches?: RegExp;
  multiSelect?: boolean;
  searchableValues?: boolean;
  collapsedByDefault?: boolean;
  maxVisibleValues?: number;
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    name: "Availability",
    source: "availability",
    displayType: "checkbox",
  },
  {
    name: "Price",
    source: "price",
    displayType: "range_slider",
  },
  {
    // Long lists of brands are the usual case, hence the value search box.
    name: "Brand",
    source: "vendor",
    displayType: "checkbox",
    searchableValues: true,
    maxVisibleValues: 8,
  },
  {
    name: "Product type",
    source: "product_type",
    displayType: "checkbox",
  },
  {
    name: "Colour",
    source: "product_option",
    displayType: "color_swatch",
    matches: /^colou?r$/i,
    maxVisibleValues: 18,
  },
  {
    // Sizes are short and comparable, so pills beat a checkbox column.
    name: "Size",
    source: "product_option",
    displayType: "button",
    matches: /^size$/i,
    maxVisibleValues: 12,
  },
  {
    name: "Material",
    source: "product_option",
    displayType: "checkbox",
    matches: /^(material|fabric)$/i,
    collapsedByDefault: true,
  },
  {
    // Tags are merchant-defined and often numerous, so this one starts closed.
    name: "Tag",
    source: "tag",
    displayType: "button",
    collapsedByDefault: true,
    maxVisibleValues: 12,
  },
];

/**
 * Resolves the presets that suit a catalogue.
 *
 * `existing` is compared on source + option name so running this twice does
 * not produce a second copy of every filter.
 */
export function resolvePresets(
  optionNames: string[],
  existing: { source: string; sourceKey: string | null }[],
): { preset: FilterPreset; sourceKey: string | null }[] {
  const taken = new Set(
    existing.map(
      (filter) => `${filter.source}:${(filter.sourceKey ?? "").toLowerCase()}`,
    ),
  );

  const resolved: { preset: FilterPreset; sourceKey: string | null }[] = [];

  for (const preset of FILTER_PRESETS) {
    let sourceKey: string | null = null;

    if (preset.matches) {
      const match = optionNames.find((name) => preset.matches!.test(name.trim()));
      if (!match) continue;
      sourceKey = match;
    }

    if (taken.has(`${preset.source}:${(sourceKey ?? "").toLowerCase()}`)) continue;

    resolved.push({ preset, sourceKey });
  }

  return resolved;
}
