/**
 * Engine App product querying (CLAUDE.md §7).
 *
 * Two Storefront API limitations shape this module, and both are handled
 * explicitly rather than papered over:
 *
 *  1. `collection.products` has no `totalCount`. `deriveTotalCount` recovers an
 *     exact figure when it can prove one, and returns `null` otherwise — the UI
 *     then hides the total instead of printing a guess. `search` DOES expose
 *     `totalCount`, so search pages always show a real number.
 *
 *  2. Pagination is cursor-based, but the URL grammar uses page numbers. Page
 *     cursors are memoised per result signature and walked with an ids-only
 *     query when a page has not been visited yet, capped by MAX_CURSOR_HOPS.
 */

import type { StorefrontApiContext } from "@shopify/shopify-app-react-router/server";
import {
  COLLECTION_CURSOR_QUERY,
  COLLECTION_PRODUCTS_QUERY,
  SEARCH_CURSOR_QUERY,
  SEARCH_PRODUCTS_QUERY,
} from "./queries";
import type { FilterState } from "../../lib/filter-url";
import { resolvePerPage } from "../../lib/filter-url";
import { TtlCache, TTL, cacheKey } from "../../lib/cache.server";
import { logger } from "../../lib/logger.server";

// ---------------------------------------------------------------------------
// Wire types (subset of the Storefront schema we actually read)
// ---------------------------------------------------------------------------

export interface StorefrontFilterValue {
  id: string;
  label: string;
  count: number;
  input: string;
  swatch?: {
    color?: string | null;
    image?: { previewImage?: { url: string } | null } | null;
  } | null;
}

export interface StorefrontFilter {
  id: string;
  label: string;
  type: string;
  presentation?: string | null;
  values: StorefrontFilterValue[];
}

interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

interface StorefrontImage {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

interface StorefrontProduct {
  id: string;
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  availableForSale: boolean;
  tags?: string[];
  featuredImage?: StorefrontImage | null;
  images?: { nodes: StorefrontImage[] };
  priceRange: { minVariantPrice: MoneyV2; maxVariantPrice: MoneyV2 };
  compareAtPriceRange?: { minVariantPrice: MoneyV2 } | null;
  options?: {
    name: string;
    optionValues: {
      name: string;
      swatch?: {
        color?: string | null;
        image?: { previewImage?: { url: string } | null } | null;
      } | null;
    }[];
  }[];
  rating?: { value: string } | null;
  ratingCount?: { value: string } | null;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
  startCursor: string | null;
}

// ---------------------------------------------------------------------------
// Normalised output (the app proxy response contract, CLAUDE.md §6.4)
// ---------------------------------------------------------------------------

export interface ProductCard {
  id: string;
  title: string;
  handle: string;
  url: string;
  vendor: string | null;
  productType: string | null;
  image: StorefrontImage | null;
  hoverImage: StorefrontImage | null;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  priceVaries: boolean;
  available: boolean;
  onSale: boolean;
  rating: { value: number; count: number } | null;
  options: { name: string; values: string[] }[];
  swatches: { value: string; color: string | null; image: string | null }[];
}

export interface ProductQueryResult {
  products: ProductCard[];
  filters: StorefrontFilter[];
  pageInfo: PageInfo;
  /** Exact when known, `null` when the Storefront API cannot prove one. */
  totalCount: number | null;
  /** How `totalCount` was obtained — surfaced in `meta` for debugging. */
  countSource: "search" | "single-page" | "partition-facet" | "unknown";
}

// ---------------------------------------------------------------------------
// Sort mapping (CLAUDE.md §10.6)
// ---------------------------------------------------------------------------

interface SortSpec {
  sortKey: string;
  reverse: boolean;
}

const COLLECTION_SORTS: Record<string, SortSpec> = {
  manual: { sortKey: "MANUAL", reverse: false },
  "best-selling": { sortKey: "BEST_SELLING", reverse: false },
  "title-ascending": { sortKey: "TITLE", reverse: false },
  "title-descending": { sortKey: "TITLE", reverse: true },
  "price-ascending": { sortKey: "PRICE", reverse: false },
  "price-descending": { sortKey: "PRICE", reverse: true },
  "created-ascending": { sortKey: "CREATED", reverse: false },
  "created-descending": { sortKey: "CREATED", reverse: true },
  relevance: { sortKey: "RELEVANCE", reverse: false },
};

/**
 * `SearchSortKeys` only offers RELEVANCE and PRICE, so title/date sorts on a
 * search page fall back to relevance. The UI hides the unsupported options
 * rather than silently reordering by something else.
 */
const SEARCH_SORTS: Record<string, SortSpec> = {
  relevance: { sortKey: "RELEVANCE", reverse: false },
  "price-ascending": { sortKey: "PRICE", reverse: false },
  "price-descending": { sortKey: "PRICE", reverse: true },
};

export const SEARCH_SUPPORTED_SORTS = Object.keys(SEARCH_SORTS);

function collectionSort(sort: string | null): SortSpec {
  return COLLECTION_SORTS[sort ?? "manual"] ?? COLLECTION_SORTS.manual;
}

function searchSort(sort: string | null): SortSpec {
  return SEARCH_SORTS[sort ?? "relevance"] ?? SEARCH_SORTS.relevance;
}

// ---------------------------------------------------------------------------
// URL state -> ProductFilter[]
// ---------------------------------------------------------------------------

export type ProductFilterInput = Record<string, unknown>;

/**
 * Index of `label -> input JSON` per filter param, harvested from a previous
 * facet response. It lets metafield and bucketed range filters round-trip
 * without the app re-deriving Shopify's bucketing rules.
 */
export type FacetInputIndex = Record<string, Record<string, string>>;

function parseFacetInput(raw: string): ProductFilterInput | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ProductFilterInput;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Builds the `filters:` argument from parsed URL state. */
export function buildProductFilters(
  state: FilterState,
  facetInputs: FacetInputIndex = {},
): ProductFilterInput[] {
  const filters: ProductFilterInput[] = [];

  for (const [param, selection] of Object.entries(state.selections)) {
    // Range params first — they never have list values.
    if (selection.min !== null || selection.max !== null) {
      if (param === "filter.v.price") {
        const price: Record<string, number> = {};
        if (selection.min !== null) price.min = selection.min;
        if (selection.max !== null) price.max = selection.max;
        filters.push({ price });
        continue;
      }

      const metafield = metafieldFromParam(param);
      if (metafield) {
        // Numeric metafield ranges are expressed by Shopify as pre-bucketed
        // facet values, so reuse the recorded input for every bucket at or
        // above the requested threshold.
        const inputs = facetInputs[param] ?? {};
        const matching = Object.entries(inputs)
          .filter(([label]) => labelSatisfiesRange(label, selection.min, selection.max))
          .map(([, raw]) => parseFacetInput(raw))
          .filter((value): value is ProductFilterInput => value !== null);
        filters.push(...matching);
      }
      continue;
    }

    for (const value of selection.values) {
      // Prefer the exact input Shopify gave us for this value, when known.
      const recorded = facetInputs[param]?.[value];
      const parsed = recorded ? parseFacetInput(recorded) : null;
      if (parsed) {
        filters.push(parsed);
        continue;
      }

      const constructed = constructProductFilter(param, value);
      if (constructed) filters.push(constructed);
    }
  }

  return filters;
}

function constructProductFilter(
  param: string,
  value: string,
): ProductFilterInput | null {
  if (param === "filter.v.availability") {
    return { available: value === "1" || value.toLowerCase() === "true" };
  }
  if (param === "filter.p.vendor") return { productVendor: value };
  if (param === "filter.p.product_type") return { productType: value };
  if (param === "filter.p.tag") return { tag: value };

  if (param.startsWith("filter.v.option.")) {
    return {
      variantOption: {
        name: param.slice("filter.v.option.".length),
        value,
      },
    };
  }

  const metafield = metafieldFromParam(param);
  if (metafield) {
    const key = param.startsWith("filter.v.m.")
      ? "variantMetafield"
      : "productMetafield";
    return { [key]: { ...metafield, value } };
  }

  return null;
}

function metafieldFromParam(
  param: string,
): { namespace: string; key: string } | null {
  const prefix = param.startsWith("filter.p.m.")
    ? "filter.p.m."
    : param.startsWith("filter.v.m.")
      ? "filter.v.m."
      : null;
  if (!prefix) return null;

  const rest = param.slice(prefix.length);
  const separator = rest.indexOf(".");
  if (separator <= 0) return null;

  return {
    namespace: rest.slice(0, separator),
    key: rest.slice(separator + 1),
  };
}

/** Interprets a bucket label such as "4" or "4 - 5" against a min/max window. */
function labelSatisfiesRange(
  label: string,
  min: number | null,
  max: number | null,
): boolean {
  const numbers = label.match(/\d+(\.\d+)?/g);
  if (!numbers || numbers.length === 0) return false;

  const low = Number(numbers[0]);
  const high = Number(numbers[numbers.length - 1]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return false;

  if (min !== null && high < min) return false;
  if (max !== null && low > max) return false;
  return true;
}

/** Records the `label -> input` map from a facet response for later reuse. */
export function indexFacetInputs(
  filters: StorefrontFilter[],
  paramForFilterId: (filterId: string) => string | null,
): FacetInputIndex {
  const index: FacetInputIndex = {};

  for (const filter of filters) {
    const param = paramForFilterId(filter.id);
    if (!param) continue;

    const entries: Record<string, string> = {};
    for (const value of filter.values) {
      entries[value.label] = value.input;
    }
    index[param] = entries;
  }

  return index;
}

// ---------------------------------------------------------------------------
// Total count derivation
// ---------------------------------------------------------------------------

/**
 * Availability partitions a catalogue exactly once per product, so summing its
 * facet counts yields a true total. No other default facet has that property
 * (a product can carry many tags, one type but possibly none, and so on).
 */
const PARTITIONING_FILTER_IDS = ["filter.v.availability"];

export function deriveTotalCount(
  filters: StorefrontFilter[],
  nodeCount: number,
  pageInfo: PageInfo,
  page: number,
): { total: number | null; source: ProductQueryResult["countSource"] } {
  if (page === 1 && !pageInfo.hasNextPage) {
    return { total: nodeCount, source: "single-page" };
  }

  const partition = filters.find((filter) =>
    PARTITIONING_FILTER_IDS.includes(filter.id),
  );
  if (partition && partition.values.length > 0) {
    const total = partition.values.reduce((sum, value) => sum + value.count, 0);
    if (total > 0) return { total, source: "partition-facet" };
  }

  return { total: null, source: "unknown" };
}

// ---------------------------------------------------------------------------
// Cursor walking
// ---------------------------------------------------------------------------

const MAX_CURSOR_HOPS = 10;
const cursorCache = new TtlCache<Record<number, string>>({
  maxEntries: 2_000,
  defaultTtlMs: TTL.products,
});

interface CursorWalkArgs {
  storefront: StorefrontApiContext;
  signature: string;
  page: number;
  perPage: number;
  query: string;
  variables: Record<string, unknown>;
  readPageInfo: (data: unknown) => { hasNextPage: boolean; endCursor: string | null } | null;
}

/**
 * Resolves the `after` cursor for a 1-indexed page. Returns `undefined` for
 * page 1, and `null` when the page is unreachable (past the end, or beyond the
 * hop cap) so the caller can serve an empty page rather than a wrong one.
 */
async function resolveCursor({
  storefront,
  signature,
  page,
  perPage,
  query,
  variables,
  readPageInfo,
}: CursorWalkArgs): Promise<string | undefined | null> {
  if (page <= 1) return undefined;

  const key = cacheKey(signature);
  const known = cursorCache.get(key) ?? {};
  if (known[page]) return known[page];

  // Start from the deepest cached page below the target.
  let cursorPage = 1;
  let cursor: string | undefined;
  for (let candidate = page - 1; candidate >= 2; candidate -= 1) {
    if (known[candidate]) {
      cursorPage = candidate;
      cursor = known[candidate];
      break;
    }
  }

  let hops = 0;
  while (cursorPage < page) {
    if (hops >= MAX_CURSOR_HOPS) {
      logger.warn("storefront.cursor_hop_cap", { page, cursorPage });
      return null;
    }

    const response = await storefront.graphql(query, {
      variables: { ...variables, first: perPage, after: cursor ?? null },
    });
    const body = (await response.json()) as { data?: unknown };
    const pageInfo = readPageInfo(body.data);

    if (!pageInfo || !pageInfo.endCursor) return null;

    cursorPage += 1;
    cursor = pageInfo.endCursor;
    known[cursorPage] = cursor;
    hops += 1;

    if (!pageInfo.hasNextPage && cursorPage < page) {
      // Requested page is past the end of the result set.
      cursorCache.set(key, known);
      return null;
    }
  }

  cursorCache.set(key, known);
  return cursor;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProduct(product: StorefrontProduct): ProductCard {
  const images = product.images?.nodes ?? [];
  const image = product.featuredImage ?? images[0] ?? null;
  const hoverImage =
    images.find((candidate) => candidate.url !== image?.url) ?? null;

  const price = product.priceRange.minVariantPrice;
  const maxPrice = product.priceRange.maxVariantPrice;
  const compareAt = product.compareAtPriceRange?.minVariantPrice ?? null;

  const priceAmount = Number(price.amount);
  const compareAmount = compareAt ? Number(compareAt.amount) : 0;
  const onSale = compareAmount > priceAmount;

  const ratingValue = parseRating(product.rating?.value ?? null);
  const ratingCount = toNumber(product.ratingCount?.value ?? null);

  const swatches: ProductCard["swatches"] = [];
  const options: ProductCard["options"] = [];

  for (const option of product.options ?? []) {
    options.push({
      name: option.name,
      values: option.optionValues.map((value) => value.name),
    });

    for (const value of option.optionValues) {
      if (!value.swatch) continue;
      swatches.push({
        value: value.name,
        color: value.swatch.color ?? null,
        image: value.swatch.image?.previewImage?.url ?? null,
      });
    }
  }

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    url: `/products/${product.handle}`,
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    image,
    hoverImage,
    price: price.amount,
    compareAtPrice: onSale && compareAt ? compareAt.amount : null,
    currency: price.currencyCode,
    priceVaries: price.amount !== maxPrice.amount,
    available: product.availableForSale,
    onSale,
    rating:
      ratingValue !== null
        ? { value: ratingValue, count: ratingCount ?? 0 }
        : null,
    options,
    swatches,
  };
}

/** Shopify `rating` metafields serialise as `{"value":"4.5","scale_min":…}`. */
function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;

  try {
    const parsed = JSON.parse(raw) as { value?: string | number };
    const value = Number(parsed?.value);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export interface FetchProductsArgs {
  storefront: StorefrontApiContext;
  state: FilterState;
  /** Collection handle, or null for a search / all-products context. */
  collectionHandle: string | null;
  facetInputs?: FacetInputIndex;
  signature: string;
}

export async function fetchProducts({
  storefront,
  state,
  collectionHandle,
  facetInputs = {},
  signature,
}: FetchProductsArgs): Promise<ProductQueryResult> {
  const perPage = resolvePerPage(state);
  const productFilters = buildProductFilters(state, facetInputs);

  return collectionHandle && !state.term
    ? fetchCollectionProducts({
        storefront,
        collectionHandle,
        state,
        perPage,
        productFilters,
        signature,
      })
    : fetchSearchProducts({
        storefront,
        state,
        perPage,
        productFilters,
        signature,
        collectionHandle,
      });
}

interface CollectionArgs {
  storefront: StorefrontApiContext;
  collectionHandle: string;
  state: FilterState;
  perPage: number;
  productFilters: ProductFilterInput[];
  signature: string;
}

async function fetchCollectionProducts({
  storefront,
  collectionHandle,
  state,
  perPage,
  productFilters,
  signature,
}: CollectionArgs): Promise<ProductQueryResult> {
  const { sortKey, reverse } = collectionSort(state.sort);
  const baseVariables = {
    handle: collectionHandle,
    sortKey,
    reverse,
    filters: productFilters,
  };

  const after = await resolveCursor({
    storefront,
    signature,
    page: state.page,
    perPage,
    query: COLLECTION_CURSOR_QUERY,
    variables: baseVariables,
    readPageInfo: (data) =>
      (data as { collection?: { products?: { pageInfo: PageInfo } } })?.collection
        ?.products?.pageInfo ?? null,
  });

  if (after === null) return emptyResult();

  const response = await storefront.graphql(COLLECTION_PRODUCTS_QUERY, {
    variables: { ...baseVariables, first: perPage, after: after ?? null },
  });
  const body = (await response.json()) as {
    data?: {
      collection?: {
        products: {
          filters: StorefrontFilter[];
          pageInfo: PageInfo;
          nodes: StorefrontProduct[];
        };
      } | null;
    };
    errors?: unknown;
  };

  if (body.errors) {
    logger.error("storefront.collection_query_failed", {
      collectionHandle,
      errors: body.errors,
    });
  }

  const connection = body.data?.collection?.products;
  if (!connection) return emptyResult();

  const { total, source } = deriveTotalCount(
    connection.filters,
    connection.nodes.length,
    connection.pageInfo,
    state.page,
  );

  return {
    products: connection.nodes.map(normalizeProduct),
    filters: connection.filters,
    pageInfo: connection.pageInfo,
    totalCount: total,
    countSource: source,
  };
}

interface SearchArgs {
  storefront: StorefrontApiContext;
  state: FilterState;
  perPage: number;
  productFilters: ProductFilterInput[];
  signature: string;
  collectionHandle: string | null;
}

async function fetchSearchProducts({
  storefront,
  state,
  perPage,
  productFilters,
  signature,
  collectionHandle,
}: SearchArgs): Promise<ProductQueryResult> {
  const { sortKey, reverse } = searchSort(state.sort);

  // An empty term with a collection context means "everything in the
  // collection"; Storefront search needs a non-empty query, so use a wildcard.
  const query = state.term ?? "*";
  const baseVariables = {
    query,
    sortKey,
    reverse,
    productFilters,
    ...(collectionHandle ? {} : {}),
  };

  const after = await resolveCursor({
    storefront,
    signature,
    page: state.page,
    perPage,
    query: SEARCH_CURSOR_QUERY,
    variables: baseVariables,
    readPageInfo: (data) =>
      (data as { search?: { pageInfo: PageInfo } })?.search?.pageInfo ?? null,
  });

  if (after === null) return emptyResult();

  const response = await storefront.graphql(SEARCH_PRODUCTS_QUERY, {
    variables: { ...baseVariables, first: perPage, after: after ?? null },
  });
  const body = (await response.json()) as {
    data?: {
      search?: {
        totalCount: number;
        productFilters: StorefrontFilter[];
        pageInfo: PageInfo;
        nodes: StorefrontProduct[];
      };
    };
    errors?: unknown;
  };

  if (body.errors) {
    logger.error("storefront.search_query_failed", { errors: body.errors });
  }

  const search = body.data?.search;
  if (!search) return emptyResult();

  return {
    products: search.nodes.map(normalizeProduct),
    filters: search.productFilters,
    pageInfo: search.pageInfo,
    totalCount: search.totalCount,
    countSource: "search",
  };
}

function emptyResult(): ProductQueryResult {
  return {
    products: [],
    filters: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      endCursor: null,
      startCursor: null,
    },
    totalCount: 0,
    countSource: "single-page",
  };
}
