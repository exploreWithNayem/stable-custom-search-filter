/**
 * Filter source + display-type registry (CLAUDE.md §8).
 *
 * Adding a new Shopify data source must only require: an entry here, a query
 * mapper in services/filters, and a URL-grammar mapping in lib/filter-url.ts.
 *
 * This module is imported by the storefront bundle — keep it dependency-free
 * and free of server-only imports.
 */

export const FILTER_SOURCES = [
  "product_option",
  "variant_option",
  "vendor",
  "product_type",
  "tag",
  "collection",
  "price",
  "availability",
  "product_metafield",
  "variant_metafield",
  "rating",
  "title",
] as const;

export type FilterSource = (typeof FILTER_SOURCES)[number];

export const FILTER_DISPLAY_TYPES = [
  "checkbox",
  "radio",
  "dropdown",
  "range",
  "range_slider",
  "color_swatch",
  "image_swatch",
  "rating",
  "boolean",
  "button",
] as const;

export type FilterDisplayType = (typeof FILTER_DISPLAY_TYPES)[number];

export const VALUE_SORTS = ["count", "alpha", "manual"] as const;
export type ValueSort = (typeof VALUE_SORTS)[number];

/** How a source's values behave, which drives parsing and rendering. */
export type FilterValueKind = "list" | "numeric" | "boolean";

/**
 * How sources are grouped in the "Option type" picker. Standard sources need
 * nothing but a label; the other two ask the merchant which option or
 * metafield the filter reads, which is why they are separated.
 */
export const FILTER_SOURCE_GROUPS = [
  { id: "standard", label: "Standard" },
  { id: "product_option", label: "Product option" },
  { id: "product_metafield", label: "Product metafield" },
] as const;

export type FilterSourceGroup = (typeof FILTER_SOURCE_GROUPS)[number]["id"];

export interface FilterSourceDefinition {
  source: FilterSource;
  label: string;
  group: FilterSourceGroup;
  helpText: string;
  /** Does the merchant have to pick an option name / metafield key? */
  requiresSourceKey: boolean;
  /** Label shown above the source-key picker, when required. */
  sourceKeyLabel?: string;
  valueKind: FilterValueKind;
  /**
   * Can Shopify's own storefront filtering express this? Drives Engine Native
   * eligibility (CLAUDE.md §7). "conditional" = depends on merchant setup.
   */
  nativeFilterable: boolean | "conditional";
  allowedDisplayTypes: readonly FilterDisplayType[];
  defaultDisplayType: FilterDisplayType;
}

const LIST_DISPLAY_TYPES = [
  "checkbox",
  "radio",
  "dropdown",
  "button",
  "color_swatch",
  "image_swatch",
] as const;

export const FILTER_SOURCE_DEFINITIONS: Record<
  FilterSource,
  FilterSourceDefinition
> = {
  product_option: {
    source: "product_option",
    label: "Product option",
    group: "product_option",
    helpText: "Filter by a product option such as Color, Size or Material.",
    requiresSourceKey: true,
    sourceKeyLabel: "Option",
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: LIST_DISPLAY_TYPES,
    defaultDisplayType: "checkbox",
  },
  variant_option: {
    source: "variant_option",
    label: "Variant option",
    group: "product_option",
    helpText: "Filter by an option defined at the variant level.",
    requiresSourceKey: true,
    sourceKeyLabel: "Option",
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: LIST_DISPLAY_TYPES,
    defaultDisplayType: "checkbox",
  },
  vendor: {
    source: "vendor",
    label: "Vendor",
    group: "standard",
    helpText: "Filter by the product vendor, often used as the brand.",
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: ["checkbox", "radio", "dropdown", "button"],
    defaultDisplayType: "checkbox",
  },
  product_type: {
    source: "product_type",
    label: "Product type",
    group: "standard",
    helpText: "Filter by the product type set on each product.",
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: ["checkbox", "radio", "dropdown", "button"],
    defaultDisplayType: "checkbox",
  },
  tag: {
    source: "tag",
    label: "Tag",
    group: "standard",
    helpText: "Filter by product tags.",
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: LIST_DISPLAY_TYPES,
    defaultDisplayType: "button",
  },
  collection: {
    source: "collection",
    label: "Collection",
    group: "standard",
    helpText:
      'Filter by collection membership — the usual source for a "Shop by category" list.',
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: "conditional",
    allowedDisplayTypes: ["checkbox", "radio", "dropdown", "button"],
    defaultDisplayType: "radio",
  },
  price: {
    source: "price",
    label: "Price",
    group: "standard",
    helpText: "Filter by variant price range.",
    requiresSourceKey: false,
    valueKind: "numeric",
    nativeFilterable: true,
    allowedDisplayTypes: ["range", "range_slider"],
    defaultDisplayType: "range_slider",
  },
  availability: {
    source: "availability",
    label: "Availability",
    group: "standard",
    helpText: "Filter by in stock / out of stock.",
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: true,
    allowedDisplayTypes: ["checkbox", "radio", "boolean", "button"],
    defaultDisplayType: "checkbox",
  },
  product_metafield: {
    source: "product_metafield",
    label: "Product metafield",
    group: "product_metafield",
    helpText:
      "Filter by a product metafield. The definition must be marked as filterable in Shopify.",
    requiresSourceKey: true,
    sourceKeyLabel: "Metafield",
    valueKind: "list",
    nativeFilterable: "conditional",
    allowedDisplayTypes: FILTER_DISPLAY_TYPES,
    defaultDisplayType: "checkbox",
  },
  variant_metafield: {
    source: "variant_metafield",
    label: "Variant metafield",
    group: "product_metafield",
    helpText:
      "Filter by a variant metafield. The definition must be marked as filterable in Shopify.",
    requiresSourceKey: true,
    sourceKeyLabel: "Metafield",
    valueKind: "list",
    nativeFilterable: "conditional",
    allowedDisplayTypes: FILTER_DISPLAY_TYPES,
    defaultDisplayType: "checkbox",
  },
  rating: {
    source: "rating",
    label: "Rating",
    group: "standard",
    helpText:
      'Filter by a rating metafield such as reviews.rating, using "N stars and up".',
    requiresSourceKey: true,
    sourceKeyLabel: "Rating metafield",
    valueKind: "numeric",
    nativeFilterable: "conditional",
    allowedDisplayTypes: ["rating"],
    defaultDisplayType: "rating",
  },
  title: {
    source: "title",
    label: "Product title",
    group: "standard",
    helpText:
      "Match against the product title. Requires the app filtering engine.",
    requiresSourceKey: false,
    valueKind: "list",
    nativeFilterable: false,
    allowedDisplayTypes: ["checkbox", "dropdown"],
    defaultDisplayType: "checkbox",
  },
};

export const FILTER_DISPLAY_LABELS: Record<FilterDisplayType, string> = {
  checkbox: "Checkbox",
  radio: "Radio",
  dropdown: "Dropdown",
  range: "Range",
  range_slider: "Range slider",
  color_swatch: "Color swatch",
  image_swatch: "Image swatch",
  rating: "Rating",
  boolean: "Boolean",
  button: "Button / pill",
};

/** Display types that render a numeric min/max instead of a value list. */
export const RANGE_DISPLAY_TYPES: readonly FilterDisplayType[] = [
  "range",
  "range_slider",
  "rating",
];

export function isRangeDisplayType(displayType: string): boolean {
  return RANGE_DISPLAY_TYPES.includes(displayType as FilterDisplayType);
}

/** Sources arranged for the "Option type" picker, in registry order. */
export function groupedFilterSources(): {
  id: FilterSourceGroup;
  label: string;
  sources: FilterSourceDefinition[];
}[] {
  return FILTER_SOURCE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    sources: FILTER_SOURCES.map(
      (source) => FILTER_SOURCE_DEFINITIONS[source],
    ).filter((definition) => definition.group === group.id),
  })).filter((group) => group.sources.length > 0);
}

export function isFilterSource(value: string): value is FilterSource {
  return (FILTER_SOURCES as readonly string[]).includes(value);
}

export function isFilterDisplayType(value: string): value is FilterDisplayType {
  return (FILTER_DISPLAY_TYPES as readonly string[]).includes(value);
}

/**
 * Validates a source/display pairing. Returns null when valid, or a
 * merchant-facing reason when not (CLAUDE.md §13.3 — never fail silently).
 */
export function validateSourceDisplayPair(
  source: string,
  displayType: string,
): string | null {
  if (!isFilterSource(source)) return `Unknown data source "${source}".`;
  if (!isFilterDisplayType(displayType)) {
    return `Unknown display type "${displayType}".`;
  }
  const definition = FILTER_SOURCE_DEFINITIONS[source];
  if (!definition.allowedDisplayTypes.includes(displayType)) {
    const allowed = definition.allowedDisplayTypes
      .map((type) => FILTER_DISPLAY_LABELS[type])
      .join(", ");
    return `${definition.label} filters can only be displayed as: ${allowed}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Metafield type compatibility (CLAUDE.md §6.6)
// ---------------------------------------------------------------------------

export const METAFIELD_TYPE_DISPLAY_TYPES: Record<
  string,
  readonly FilterDisplayType[]
> = {
  single_line_text_field: [
    "checkbox",
    "radio",
    "dropdown",
    "button",
    "color_swatch",
    "image_swatch",
  ],
  "list.single_line_text_field": [
    "checkbox",
    "dropdown",
    "button",
    "color_swatch",
    "image_swatch",
  ],
  multi_line_text_field: ["checkbox", "dropdown"],
  boolean: ["boolean", "checkbox", "radio"],
  number_integer: ["range", "range_slider", "checkbox", "dropdown"],
  number_decimal: ["range", "range_slider"],
  dimension: ["range", "range_slider"],
  weight: ["range", "range_slider"],
  volume: ["range", "range_slider"],
  rating: ["rating", "range", "range_slider"],
  color: ["color_swatch", "checkbox"],
  "list.color": ["color_swatch", "checkbox"],
};

export function displayTypesForMetafieldType(
  metafieldType: string,
): readonly FilterDisplayType[] {
  return METAFIELD_TYPE_DISPLAY_TYPES[metafieldType] ?? [];
}

export function isMetafieldTypeSupported(metafieldType: string): boolean {
  return displayTypesForMetafieldType(metafieldType).length > 0;
}
