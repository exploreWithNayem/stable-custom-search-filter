/**
 * Filter URL grammar (CLAUDE.md §9) — the single implementation, shared by the
 * server and the storefront bundle.
 *
 * CONSTRAINTS: no dependencies, no Node or DOM globals. `scripts/build-extension-assets.mjs`
 * bundles this file into the theme extension asset, and a test asserts the two
 * stay in sync, so anything imported here also ends up in the storefront bundle.
 *
 * The grammar mirrors Shopify's native storefront filtering so URLs stay
 * shareable, crawlable and compatible with native collection pages.
 */

import type { FilterSource } from "../config/filter-types";

export const SORT_OPTIONS = [
  { value: "manual", label: "Featured" },
  { value: "best-selling", label: "Best selling" },
  { value: "title-ascending", label: "Alphabetically, A-Z" },
  { value: "title-descending", label: "Alphabetically, Z-A" },
  { value: "price-ascending", label: "Price, low to high" },
  { value: "price-descending", label: "Price, high to low" },
  { value: "created-descending", label: "Newest" },
  { value: "created-ascending", label: "Oldest" },
  { value: "relevance", label: "Relevance" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const SORT_VALUES: readonly string[] = SORT_OPTIONS.map((o) => o.value);

/** Sort keys that only make sense on a search results page. */
export const SEARCH_ONLY_SORTS: readonly string[] = ["relevance"];

export const DEFAULT_PER_PAGE = 24;
export const PER_PAGE_OPTIONS = [12, 24, 36, 48] as const;
export const MAX_PAGE = 500;
export const MAX_TERM_LENGTH = 128;
export const MAX_VALUES_PER_FILTER = 64;

export const PARAM_TERM = "q";
export const PARAM_SORT = "sort_by";
export const PARAM_PAGE = "page";
export const PARAM_PER_PAGE = "limit";

const RANGE_SUFFIXES = [".gte", ".lte"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Selection {
  /** OR-ed values for list filters. */
  values: string[];
  /** Inclusive lower bound for range filters. */
  min: number | null;
  /** Inclusive upper bound for range filters. */
  max: number | null;
}

export interface FilterState {
  term: string | null;
  sort: string | null;
  page: number;
  perPage: number | null;
  /** Keyed by canonical param key, e.g. "filter.v.option.color". */
  selections: Record<string, Selection>;
}

// ---------------------------------------------------------------------------
// Param key construction
// ---------------------------------------------------------------------------

/**
 * Shopify lowercases and underscores option names in filter params
 * ("Heel Height" -> "heel_height").
 */
export function normalizeParamSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Builds the canonical query-param key for a filter definition.
 * Returns null when the definition cannot be expressed (missing source key).
 */
export function toParamKey(
  source: FilterSource | string,
  sourceKey?: string | null,
): string | null {
  switch (source) {
    case "price":
      return "filter.v.price";
    case "availability":
      return "filter.v.availability";
    case "vendor":
      return "filter.p.vendor";
    case "product_type":
      return "filter.p.product_type";
    case "tag":
      return "filter.p.tag";
    case "collection":
      return "filter.p.collection";
    case "title":
      return "filter.p.title";
    case "product_option":
    case "variant_option": {
      if (!sourceKey) return null;
      return `filter.v.option.${normalizeParamSegment(sourceKey)}`;
    }
    case "product_metafield":
    case "rating": {
      if (!sourceKey) return null;
      return `filter.p.m.${normalizeMetafieldKey(sourceKey)}`;
    }
    case "variant_metafield": {
      if (!sourceKey) return null;
      return `filter.v.m.${normalizeMetafieldKey(sourceKey)}`;
    }
    default:
      return null;
  }
}

function normalizeMetafieldKey(sourceKey: string): string {
  return sourceKey
    .split(".")
    .map((segment) => normalizeParamSegment(segment))
    .filter(Boolean)
    .join(".");
}

/** Inverse of {@link toParamKey}, best-effort — used to interpret unknown params. */
export function fromParamKey(
  param: string,
): { source: FilterSource; sourceKey: string | null } | null {
  if (param === "filter.v.price") return { source: "price", sourceKey: null };
  if (param === "filter.v.availability") {
    return { source: "availability", sourceKey: null };
  }
  if (param === "filter.p.vendor") return { source: "vendor", sourceKey: null };
  if (param === "filter.p.product_type") {
    return { source: "product_type", sourceKey: null };
  }
  if (param === "filter.p.tag") return { source: "tag", sourceKey: null };
  if (param === "filter.p.collection") {
    return { source: "collection", sourceKey: null };
  }
  if (param === "filter.p.title") return { source: "title", sourceKey: null };
  if (param.startsWith("filter.v.option.")) {
    return {
      source: "product_option",
      sourceKey: param.slice("filter.v.option.".length),
    };
  }
  if (param.startsWith("filter.p.m.")) {
    return {
      source: "product_metafield",
      sourceKey: param.slice("filter.p.m.".length),
    };
  }
  if (param.startsWith("filter.v.m.")) {
    return {
      source: "variant_metafield",
      sourceKey: param.slice("filter.v.m.".length),
    };
  }
  return null;
}

export function isFilterParam(param: string): boolean {
  return param.startsWith("filter.");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function emptySelection(): Selection {
  return { values: [], min: null, max: null };
}

function toFiniteNumber(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads a filter state out of a query string. Unknown parameters are ignored
 * rather than echoed back, and every value is clamped — this runs on untrusted
 * input in the proxy endpoints (CLAUDE.md §16).
 */
export function parseFilterState(
  input: string | URLSearchParams,
): FilterState {
  const params =
    typeof input === "string" ? new URLSearchParams(input) : input;

  const state: FilterState = {
    term: null,
    sort: null,
    page: 1,
    perPage: null,
    selections: {},
  };

  const rawTerm = params.get(PARAM_TERM);
  if (rawTerm !== null) {
    const term = rawTerm.trim().slice(0, MAX_TERM_LENGTH);
    state.term = term.length > 0 ? term : null;
  }

  const rawSort = params.get(PARAM_SORT);
  if (rawSort && SORT_VALUES.includes(rawSort)) {
    state.sort = rawSort;
  }

  const rawPage = params.get(PARAM_PAGE);
  if (rawPage) {
    const page = toFiniteNumber(rawPage);
    if (page !== null && page >= 1) {
      state.page = Math.min(Math.floor(page), MAX_PAGE);
    }
  }

  const rawPerPage = params.get(PARAM_PER_PAGE);
  if (rawPerPage) {
    const perPage = toFiniteNumber(rawPerPage);
    if (
      perPage !== null &&
      (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
    ) {
      state.perPage = perPage;
    }
  }

  for (const [key, value] of params.entries()) {
    if (!isFilterParam(key)) continue;

    const suffix = RANGE_SUFFIXES.find((candidate) => key.endsWith(candidate));
    const base = suffix ? key.slice(0, -suffix.length) : key;
    if (base.length === 0) continue;

    const selection = state.selections[base] ?? emptySelection();

    if (suffix) {
      const bound = toFiniteNumber(value);
      if (bound !== null) {
        if (suffix === ".gte") selection.min = bound;
        else selection.max = bound;
      }
    } else {
      const trimmed = value.trim();
      if (
        trimmed.length > 0 &&
        !selection.values.includes(trimmed) &&
        selection.values.length < MAX_VALUES_PER_FILTER
      ) {
        selection.values.push(trimmed);
      }
    }

    state.selections[base] = selection;
  }

  // Drop selections that ended up empty (e.g. "filter.p.tag=" alone).
  for (const [key, selection] of Object.entries(state.selections)) {
    if (isSelectionEmpty(selection)) delete state.selections[key];
    else if (
      selection.min !== null &&
      selection.max !== null &&
      selection.min > selection.max
    ) {
      // Swap inverted bounds rather than returning nothing.
      const { min, max } = selection;
      selection.min = max;
      selection.max = min;
    }
  }

  return state;
}

export function isSelectionEmpty(selection: Selection): boolean {
  return (
    selection.values.length === 0 &&
    selection.min === null &&
    selection.max === null
  );
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes state back to query params. Key order is deterministic so the
 * result is cache-key stable and diffable in tests.
 */
export function serializeFilterState(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.term) params.set(PARAM_TERM, state.term);
  if (state.sort) params.set(PARAM_SORT, state.sort);
  if (state.perPage && state.perPage !== DEFAULT_PER_PAGE) {
    params.set(PARAM_PER_PAGE, String(state.perPage));
  }
  if (state.page > 1) params.set(PARAM_PAGE, String(state.page));

  for (const key of Object.keys(state.selections).sort()) {
    const selection = state.selections[key];
    for (const value of [...selection.values].sort()) {
      params.append(key, value);
    }
    if (selection.min !== null) params.set(`${key}.gte`, String(selection.min));
    if (selection.max !== null) params.set(`${key}.lte`, String(selection.max));
  }

  return params;
}

export function filterStateToSearch(state: FilterState): string {
  const params = serializeFilterState(state);
  const search = params.toString();
  return search.length > 0 ? `?${search}` : "";
}

/**
 * Stable cache key for a state (CLAUDE.md §7 — Engine App cache). Excludes
 * nothing: page and perPage change the result set, so they belong in the key.
 */
export function filterSignature(state: FilterState): string {
  return serializeFilterState(state).toString();
}

// ---------------------------------------------------------------------------
// Mutations — all return a new state, never mutate the input
// ---------------------------------------------------------------------------

function cloneState(state: FilterState): FilterState {
  const selections: Record<string, Selection> = {};
  for (const [key, selection] of Object.entries(state.selections)) {
    selections[key] = {
      values: [...selection.values],
      min: selection.min,
      max: selection.max,
    };
  }
  return { ...state, selections };
}

export function emptyFilterState(): FilterState {
  return { term: null, sort: null, page: 1, perPage: null, selections: {} };
}

/**
 * Toggles a list value. `multiSelect: false` replaces any existing selection,
 * matching radio/dropdown semantics.
 *
 * Any selection change resets pagination to page 1 (CLAUDE.md §9).
 */
export function toggleValue(
  state: FilterState,
  param: string,
  value: string,
  multiSelect = true,
): FilterState {
  const next = cloneState(state);
  const selection = next.selections[param] ?? emptySelection();
  const exists = selection.values.includes(value);

  if (!multiSelect) {
    selection.values = exists ? [] : [value];
  } else if (exists) {
    selection.values = selection.values.filter((v) => v !== value);
  } else if (selection.values.length < MAX_VALUES_PER_FILTER) {
    selection.values = [...selection.values, value];
  }

  if (isSelectionEmpty(selection)) delete next.selections[param];
  else next.selections[param] = selection;

  next.page = 1;
  return next;
}

export function setRange(
  state: FilterState,
  param: string,
  min: number | null,
  max: number | null,
): FilterState {
  const next = cloneState(state);
  const selection = next.selections[param] ?? emptySelection();

  selection.min = min !== null && Number.isFinite(min) ? min : null;
  selection.max = max !== null && Number.isFinite(max) ? max : null;

  if (
    selection.min !== null &&
    selection.max !== null &&
    selection.min > selection.max
  ) {
    const swap = selection.min;
    selection.min = selection.max;
    selection.max = swap;
  }

  if (isSelectionEmpty(selection)) delete next.selections[param];
  else next.selections[param] = selection;

  next.page = 1;
  return next;
}

/** Removes one value, or the whole selection when `value` is omitted. */
export function removeSelection(
  state: FilterState,
  param: string,
  value?: string,
): FilterState {
  const next = cloneState(state);
  const selection = next.selections[param];
  if (!selection) return next;

  if (value === undefined) {
    delete next.selections[param];
  } else {
    selection.values = selection.values.filter((v) => v !== value);
    if (isSelectionEmpty(selection)) delete next.selections[param];
    else next.selections[param] = selection;
  }

  next.page = 1;
  return next;
}

/** Clears filters but keeps the search term, sort and page size. */
export function clearAllFilters(state: FilterState): FilterState {
  return { ...cloneState(state), selections: {}, page: 1 };
}

export function setTerm(state: FilterState, term: string | null): FilterState {
  const next = cloneState(state);
  const trimmed = term?.trim().slice(0, MAX_TERM_LENGTH) ?? "";
  next.term = trimmed.length > 0 ? trimmed : null;
  next.page = 1;
  return next;
}

export function setSort(state: FilterState, sort: string | null): FilterState {
  const next = cloneState(state);
  next.sort = sort && SORT_VALUES.includes(sort) ? sort : null;
  next.page = 1;
  return next;
}

export function setPerPage(
  state: FilterState,
  perPage: number | null,
): FilterState {
  const next = cloneState(state);
  next.perPage =
    perPage !== null && (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : null;
  next.page = 1;
  return next;
}

export function setPage(state: FilterState, page: number): FilterState {
  const next = cloneState(state);
  next.page = Math.min(Math.max(1, Math.floor(page)), MAX_PAGE);
  return next;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getSelection(state: FilterState, param: string): Selection {
  return state.selections[param] ?? emptySelection();
}

export function isValueActive(
  state: FilterState,
  param: string,
  value: string,
): boolean {
  return state.selections[param]?.values.includes(value) ?? false;
}

export function activeFilterCount(state: FilterState): number {
  let count = 0;
  for (const selection of Object.values(state.selections)) {
    count += selection.values.length;
    if (selection.min !== null || selection.max !== null) count += 1;
  }
  return count;
}

export function hasActiveFilters(state: FilterState): boolean {
  return activeFilterCount(state) > 0;
}

export function resolvePerPage(state: FilterState): number {
  return state.perPage ?? DEFAULT_PER_PAGE;
}

export function sortLabel(value: string | null): string {
  return SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Featured";
}
