/**
 * GET /apps/scfs/products?<filter grammar>&collection=<handle>
 *
 * Engine App: filtered, sorted, paginated products plus facets and counts.
 * Response shape is the contract in CLAUDE.md §6.4.
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  checkRateLimit,
  proxyJson,
  rateLimitKey,
  requireProxyContext,
  tooManyRequests,
} from "../lib/proxy.server";
import {
  filterSignature,
  parseFilterState,
  resolvePerPage,
} from "../lib/filter-url";
import { resolveFilterConfig } from "../services/filters/resolve.server";
import {
  buildActiveChips,
  buildFacets,
} from "../services/filters/facets.server";
import {
  fetchProducts,
  indexFacetInputs,
  type FacetInputIndex,
  type ProductQueryResult,
} from "../services/storefront/product-query.server";
import { expandSearchTerm } from "../services/search/synonym.server";
import { getPlanForShop } from "../models/usage.server";
import { cacheKey, productsCache, TTL, configCache } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const started = Date.now();
  const context = await requireProxyContext(request);

  if (!checkRateLimit(rateLimitKey(context, "products"), { capacity: 60 })) {
    return tooManyRequests();
  }

  const collectionHandle = context.url.searchParams.get("collection");
  const state = parseFilterState(context.url.searchParams);
  const perPage = resolvePerPage(state);

  const [config, plan] = await Promise.all([
    resolveFilterConfig(context.shop.id, collectionHandle),
    getPlanForShop(context.shop.id),
  ]);

  // Synonyms only widen the Storefront query; the shopper-visible term is
  // unchanged so chips and analytics still show what was typed.
  const expanded = state.term
    ? await expandSearchTerm(context.shop.id, state.term, plan.key)
    : null;

  const queryState = expanded ? { ...state, term: expanded.query } : state;
  const signature = filterSignature(queryState);

  // Facet `input` blobs from an earlier response let metafield/range filters
  // round-trip without re-deriving Shopify's bucketing.
  const facetInputKey = cacheKey(context.shop.domain, "facetinputs", collectionHandle);
  const facetInputs =
    (configCache.get(facetInputKey) as FacetInputIndex | undefined) ?? {};

  const resultKey = cacheKey(
    context.shop.domain,
    "products",
    collectionHandle,
    signature,
  );

  let cached = true;
  const { value: result } = await productsCache.remember(
    resultKey,
    TTL.products,
    async () => {
      cached = false;
      return fetchProducts({
        storefront: context.storefront,
        state: queryState,
        collectionHandle,
        facetInputs,
        signature,
      });
    },
  );

  const typedResult = result as ProductQueryResult;

  if (!cached && typedResult.filters.length > 0) {
    // Record the inputs Shopify handed back for the next request.
    configCache.set(
      facetInputKey,
      { ...facetInputs, ...indexFacetInputs(typedResult.filters, (id) => id) },
      TTL.config,
    );
  }

  const facets = buildFacets({
    config,
    storefrontFilters: typedResult.filters,
    state,
  });
  const activeFilters = buildActiveChips(facets, state);

  const totalPages =
    typedResult.totalCount !== null
      ? Math.max(1, Math.ceil(typedResult.totalCount / perPage))
      : null;

  const tookMs = Date.now() - started;
  if (tookMs > 1_500) {
    logger.warn("proxy.products_slow", { tookMs, collectionHandle, cached });
  }

  return proxyJson({
    products: typedResult.products,
    facets,
    activeFilters,
    pagination: {
      page: state.page,
      perPage,
      totalPages,
      hasNext: typedResult.pageInfo.hasNextPage,
      hasPrevious: state.page > 1,
    },
    totalCount: typedResult.totalCount,
    query: {
      term: state.term,
      sort: state.sort,
      collectionHandle,
      appliedSynonyms: expanded?.appliedSynonyms ?? [],
    },
    meta: {
      engine: "app",
      cached,
      countSource: typedResult.countSource,
      tookMs,
    },
  });
};
