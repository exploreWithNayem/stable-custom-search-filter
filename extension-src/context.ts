/**
 * Page context emitted by `snippets/scfs-context.liquid`.
 *
 * Everything the runtime needs to boot lives in the document, so the first
 * paint never waits on a network round trip.
 */

export interface ScfsStrings {
  clearAll: string;
  apply: string;
  close: string;
  showMore: string;
  showLess: string;
  searchValues: string;
  sale: string;
  soldOut: string;
  empty: string;
  emptyAction: string;
  error: string;
  loading: string;
  previous: string;
  next: string;
  loadMore: string;
  searchProducts: string;
  searchCollections: string;
  searchSuggestions: string;
  searchNoResults: string;
  productOne: string;
  productOther: string;
}

export interface ScfsContext {
  proxy: string;
  routes: { search: string; predictive: string; collection: string };
  context: {
    template: string;
    collection: string;
    term: string;
    locale: string;
    currency: string;
    moneyFormat: string;
  };
  strings: ScfsStrings;
}

const FALLBACK: ScfsContext = {
  proxy: "/apps/scfs",
  routes: { search: "/search", predictive: "/search/suggest", collection: "" },
  context: {
    template: "",
    collection: "",
    term: "",
    locale: "en",
    currency: "USD",
    moneyFormat: "${{amount}}",
  },
  strings: {
    clearAll: "Clear all",
    apply: "Apply filters",
    close: "Close",
    showMore: "Show more",
    showLess: "Show less",
    searchValues: "Search options",
    sale: "Sale",
    soldOut: "Sold out",
    empty: "No products match these filters.",
    emptyAction: "Clear all filters",
    error: "We couldn't load these products. Please try again.",
    loading: "Loading results",
    previous: "Previous",
    next: "Next",
    loadMore: "Load more",
    searchProducts: "Products",
    searchCollections: "Collections",
    searchSuggestions: "Suggestions",
    searchNoResults: "No products found",
    productOne: "__COUNT__ product",
    productOther: "__COUNT__ products",
  },
};

let cached: ScfsContext | null = null;

export function readContext(): ScfsContext {
  if (cached) return cached;

  const node = document.querySelector("[data-scfs-context]");
  if (!node?.textContent) {
    cached = FALLBACK;
    return cached;
  }

  try {
    const parsed = JSON.parse(node.textContent) as Partial<ScfsContext>;
    cached = {
      ...FALLBACK,
      ...parsed,
      routes: { ...FALLBACK.routes, ...parsed.routes },
      context: { ...FALLBACK.context, ...parsed.context },
      strings: { ...FALLBACK.strings, ...parsed.strings },
    };
  } catch {
    cached = FALLBACK;
  }

  return cached;
}

/** Pluralised product count, using the theme's translated strings. */
export function formatCount(count: number): string {
  const { strings } = readContext();
  const template = count === 1 ? strings.productOne : strings.productOther;
  return template.replace("__COUNT__", count.toLocaleString());
}

export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;

  const { context } = readContext();
  try {
    return new Intl.NumberFormat(context.locale || "en", {
      style: "currency",
      currency: currency || context.currency || "USD",
    }).format(value);
  } catch {
    return `${value.toFixed(2)}`;
  }
}
