/**
 * Merges Shopify's facet response with the merchant's filter configuration
 * (CLAUDE.md §8, §10.2, §10.4).
 *
 * Shopify supplies values and counts; the merchant supplies presentation —
 * label overrides, swatches, ordering, visibility and grouping. Neither side
 * alone is enough, and this is the only place the two are combined.
 */

import type { FilterState } from "../../lib/filter-url";
import { getSelection } from "../../lib/filter-url";
import { isRangeDisplayType } from "../../config/filter-types";
import type { ResolvedFilter, ResolvedFilterConfig } from "./resolve.server";
import type { StorefrontFilter } from "../storefront/product-query.server";

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  active: boolean;
  swatch: { color: string | null; image: string | null } | null;
}

export interface FacetRange {
  min: number | null;
  max: number | null;
  selectedMin: number | null;
  selectedMax: number | null;
  step: number;
  unit: string | null;
}

export interface Facet {
  handle: string;
  param: string;
  label: string;
  displayType: string;
  source: string;
  multiSelect: boolean;
  showCount: boolean;
  searchableValues: boolean;
  maxVisibleValues: number;
  collapsedByDefault: boolean;
  group: { handle: string; name: string; defaultOpen: boolean; collapsible: boolean } | null;
  values: FacetValue[];
  range: FacetRange | null;
  activeCount: number;
}

export interface ActiveFilterChip {
  param: string;
  filterHandle: string;
  filterLabel: string;
  /** Omitted for range chips, which are removed as a unit. */
  value: string | null;
  label: string;
}

// ---------------------------------------------------------------------------
// Value ordering
// ---------------------------------------------------------------------------

function sortValues(
  values: FacetValue[],
  valueSort: string,
  manualOrder: Map<string, number>,
): FacetValue[] {
  const sorted = [...values];

  switch (valueSort) {
    case "alpha":
      sorted.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      break;
    case "manual":
      sorted.sort((a, b) => {
        const aPos = manualOrder.get(a.value);
        const bPos = manualOrder.get(b.value);
        // Values the merchant has not ordered fall to the end, alphabetically.
        if (aPos === undefined && bPos === undefined) {
          return a.label.localeCompare(b.label, undefined, { numeric: true });
        }
        if (aPos === undefined) return 1;
        if (bPos === undefined) return -1;
        return aPos - bPos;
      });
      break;
    case "count":
    default:
      sorted.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      break;
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Range extraction
// ---------------------------------------------------------------------------

/**
 * Shopify returns price ranges as a single value whose `input` carries the
 * bounds, and bucketed metafield ranges as a list of labelled values. Both are
 * reduced to a numeric window here.
 */
function extractRange(
  storefrontFilter: StorefrontFilter | undefined,
  filter: ResolvedFilter,
  state: FilterState,
): FacetRange {
  const selection = getSelection(state, filter.param);
  let min: number | null = null;
  let max: number | null = null;

  for (const value of storefrontFilter?.values ?? []) {
    try {
      const input = JSON.parse(value.input) as {
        price?: { min?: number; max?: number };
      };
      if (input.price) {
        if (typeof input.price.min === "number") {
          min = min === null ? input.price.min : Math.min(min, input.price.min);
        }
        if (typeof input.price.max === "number") {
          max = max === null ? input.price.max : Math.max(max, input.price.max);
        }
        continue;
      }
    } catch {
      /* not a price input — fall through to label parsing */
    }

    const numbers = value.label.match(/\d+(\.\d+)?/g);
    if (!numbers) continue;
    for (const raw of numbers) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) continue;
      min = min === null ? parsed : Math.min(min, parsed);
      max = max === null ? parsed : Math.max(max, parsed);
    }
  }

  const configuredStep = filter.config.step;

  return {
    min,
    max,
    selectedMin: selection.min,
    selectedMax: selection.max,
    step: typeof configuredStep === "number" && configuredStep > 0 ? configuredStep : 1,
    unit: typeof filter.config.unit === "string" ? filter.config.unit : null,
  };
}

// ---------------------------------------------------------------------------
// Facet construction
// ---------------------------------------------------------------------------

export interface BuildFacetsArgs {
  config: ResolvedFilterConfig;
  storefrontFilters: StorefrontFilter[];
  state: FilterState;
}

export function buildFacets({
  config,
  storefrontFilters,
  state,
}: BuildFacetsArgs): Facet[] {
  // Shopify's `Filter.id` is the same string as our canonical param key, which
  // is exactly why the URL grammar mirrors Shopify's (CLAUDE.md D10).
  const byId = new Map(storefrontFilters.map((filter) => [filter.id, filter]));
  const facets: Facet[] = [];

  for (const filter of config.filters) {
    const storefrontFilter = byId.get(filter.param);
    const selection = getSelection(state, filter.param);
    const isRange = isRangeDisplayType(filter.displayType);

    if (isRange) {
      const range = extractRange(storefrontFilter, filter, state);
      const hasBounds = range.min !== null && range.max !== null;
      const isActive = range.selectedMin !== null || range.selectedMax !== null;

      // A range with no bounds and nothing selected has nothing to render.
      if (!hasBounds && !isActive && filter.hideEmpty) continue;

      facets.push({
        ...baseFacet(filter),
        values:
          filter.displayType === "rating"
            ? buildRatingValues(filter, storefrontFilter, state)
            : [],
        range,
        activeCount: isActive ? 1 : 0,
      });
      continue;
    }

    const manualOrder = new Map<string, number>();
    for (const [value, override] of filter.overrides) {
      manualOrder.set(value, override.position);
    }

    const values: FacetValue[] = [];
    for (const value of storefrontFilter?.values ?? []) {
      const override = filter.overrides.get(value.label);
      if (override?.hidden) continue;
      if (filter.hideEmpty && value.count === 0 && !selection.values.includes(value.label)) {
        continue;
      }

      values.push({
        value: value.label,
        label: override?.label ?? value.label,
        count: value.count,
        active: selection.values.includes(value.label),
        swatch: resolveSwatch(value, override),
      });
    }

    // Selected values that Shopify no longer returns (count dropped to zero
    // under the other filters) must still render, or the chip could not be
    // unchecked from the sidebar.
    for (const active of selection.values) {
      if (values.some((value) => value.value === active)) continue;
      const override = filter.overrides.get(active);
      values.push({
        value: active,
        label: override?.label ?? active,
        count: 0,
        active: true,
        swatch: resolveSwatch(undefined, override),
      });
    }

    if (values.length === 0 && filter.hideEmpty) continue;

    facets.push({
      ...baseFacet(filter),
      values: sortValues(values, filter.valueSort, manualOrder),
      range: null,
      activeCount: selection.values.length,
    });
  }

  return facets;
}

function baseFacet(filter: ResolvedFilter): Omit<Facet, "values" | "range" | "activeCount"> {
  return {
    handle: filter.handle,
    param: filter.param,
    label: filter.name,
    displayType: filter.displayType,
    source: filter.source,
    multiSelect: filter.multiSelect,
    showCount: filter.showCount,
    searchableValues: filter.searchableValues,
    maxVisibleValues: filter.maxVisibleValues,
    collapsedByDefault: filter.collapsedByDefault,
    group: filter.group,
  };
}

function resolveSwatch(
  value?: { swatch?: StorefrontFilter["values"][number]["swatch"] },
  override?: { swatchColor: string | null; swatchImage: string | null },
): FacetValue["swatch"] {
  // Merchant overrides win: they were set deliberately in the admin.
  const color = override?.swatchColor ?? value?.swatch?.color ?? null;
  const image =
    override?.swatchImage ?? value?.swatch?.image?.previewImage?.url ?? null;

  return color || image ? { color, image } : null;
}

/**
 * Rating filters render as "N stars and up" rows. Counts come from Shopify's
 * bucketed values when present; a bucket with no data still renders so the
 * control keeps a stable shape.
 */
function buildRatingValues(
  filter: ResolvedFilter,
  storefrontFilter: StorefrontFilter | undefined,
  state: FilterState,
): FacetValue[] {
  const configured = filter.config.ratingBuckets;
  const buckets =
    Array.isArray(configured) && configured.length > 0
      ? configured.filter((value): value is number => typeof value === "number")
      : [5, 4, 3, 2, 1];

  const selection = getSelection(state, filter.param);

  return buckets.map((threshold) => {
    const count = (storefrontFilter?.values ?? []).reduce((sum, value) => {
      const numbers = value.label.match(/\d+(\.\d+)?/g);
      if (!numbers) return sum;
      const low = Number(numbers[0]);
      return Number.isFinite(low) && low >= threshold ? sum + value.count : sum;
    }, 0);

    return {
      value: String(threshold),
      label: `${threshold} stars and up`,
      count,
      active: selection.min === threshold,
      swatch: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Active filter chips (CLAUDE.md §10.4)
// ---------------------------------------------------------------------------

export function buildActiveChips(
  facets: Facet[],
  state: FilterState,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  for (const facet of facets) {
    const selection = getSelection(state, facet.param);

    for (const value of selection.values) {
      const match = facet.values.find((candidate) => candidate.value === value);
      chips.push({
        param: facet.param,
        filterHandle: facet.handle,
        filterLabel: facet.label,
        value,
        label: `${facet.label}: ${match?.label ?? value}`,
      });
    }

    if (selection.min !== null || selection.max !== null) {
      chips.push({
        param: facet.param,
        filterHandle: facet.handle,
        filterLabel: facet.label,
        value: null,
        label: `${facet.label}: ${formatRangeLabel(facet, selection.min, selection.max)}`,
      });
    }
  }

  return chips;
}

function formatRangeLabel(
  facet: Facet,
  min: number | null,
  max: number | null,
): string {
  if (facet.displayType === "rating" && min !== null) {
    return `${min} stars and up`;
  }

  const unit = facet.range?.unit ?? "";
  const low = min !== null ? `${min}${unit}` : "";
  const high = max !== null ? `${max}${unit}` : "";

  if (low && high) return `${low} - ${high}`;
  if (low) return `From ${low}`;
  if (high) return `Up to ${high}`;
  return "Any";
}
