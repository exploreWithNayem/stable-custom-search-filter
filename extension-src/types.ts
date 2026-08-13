/** Wire types for the app proxy contract (CLAUDE.md §6.4). */

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

export interface FacetGroup {
  handle: string;
  name: string;
  defaultOpen: boolean;
  collapsible: boolean;
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
  group: FacetGroup | null;
  values: FacetValue[];
  range: FacetRange | null;
  activeCount: number;
}

export interface ActiveChip {
  param: string;
  filterHandle: string;
  filterLabel: string;
  value: string | null;
  label: string;
}

export interface ProductImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ProductCard {
  id: string;
  title: string;
  handle: string;
  url: string;
  vendor: string | null;
  productType: string | null;
  image: ProductImage | null;
  hoverImage: ProductImage | null;
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

export interface ProductsResponse {
  products: ProductCard[];
  facets: Facet[];
  activeFilters: ActiveChip[];
  pagination: {
    page: number;
    perPage: number;
    totalPages: number | null;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  totalCount: number | null;
  query: {
    term: string | null;
    sort: string | null;
    collectionHandle: string | null;
    appliedSynonyms: string[];
  };
  meta: {
    engine: string;
    cached: boolean;
    countSource: string;
    tookMs: number;
  };
}

export interface ConfigResponse {
  engine: "native" | "app";
  layout: string;
  source: string;
  collectionHandle: string | null;
  filters: {
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
    group: FacetGroup | null;
  }[];
  search: {
    enabled: boolean;
    placeholder: string;
    minChars: number;
    debounceMs: number;
    maxSuggestions: number;
    showViewAll: boolean;
    noResultsText: string;
    tier: 1 | 2;
  };
  toolbar: {
    showProductCount: boolean;
    showClearAll: boolean;
    showActiveFilters: boolean;
    showSort: boolean;
    showPerPage: boolean;
    paginationStyle: "numbered" | "load_more";
    perPageOptions: number[];
    defaultPerPage: number;
    sortOptions: { value: string; label: string }[];
    columns: number;
    mobileDrawer: boolean;
  };
  appearance: Record<string, unknown>;
  analytics: { trackSearches: boolean; trackFilters: boolean };
}

export interface SuggestResponse {
  term: string;
  redirect: string | null;
  products: {
    id: string;
    title: string;
    handle: string;
    url: string;
    image: { url: string; altText: string | null } | null;
    price: string | null;
    currency: string | null;
    vendor: string | null;
    productType: string | null;
  }[];
  collections: {
    id: string;
    title: string;
    handle: string;
    url: string;
    image: { url: string; altText: string | null } | null;
  }[];
  queries: string[];
  totalSuggestions: number;
}
