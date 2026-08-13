/**
 * Tier 2 predictive search (CLAUDE.md §11.2).
 *
 * Tier 1 — the theme calling `/search/suggest.json` directly — costs the app
 * nothing and is the default. This path only runs when the shop has synonyms,
 * redirects or custom suggestions enabled, which is why it is plan-gated.
 */

import type { StorefrontApiContext } from "@shopify/shopify-app-react-router/server";
import type { SearchConfiguration } from "@prisma/client";
import { PREDICTIVE_SEARCH_QUERY } from "../storefront/queries";
import { expandSearchTerm, findCustomSuggestions, findRedirect } from "./synonym.server";
import { logger } from "../../lib/logger.server";

export interface SuggestionProduct {
  id: string;
  title: string;
  handle: string;
  url: string;
  image: { url: string; altText: string | null } | null;
  price: string | null;
  currency: string | null;
  vendor: string | null;
  productType: string | null;
}

export interface SuggestionCollection {
  id: string;
  title: string;
  handle: string;
  url: string;
  image: { url: string; altText: string | null } | null;
}

export interface PredictiveResult {
  term: string;
  redirect: string | null;
  products: SuggestionProduct[];
  collections: SuggestionCollection[];
  queries: string[];
  totalSuggestions: number;
}

interface PredictiveWire {
  predictiveSearch?: {
    queries?: { text: string }[];
    collections?: {
      id: string;
      title: string;
      handle: string;
      image?: { url: string; altText?: string | null } | null;
    }[];
    products?: {
      id: string;
      title: string;
      handle: string;
      vendor?: string | null;
      productType?: string | null;
      featuredImage?: { url: string; altText?: string | null } | null;
      priceRange?: { minVariantPrice: { amount: string; currencyCode: string } };
    }[];
  };
}

export interface PredictiveArgs {
  storefront: StorefrontApiContext;
  shopId: string;
  planKey: string;
  term: string;
  config: SearchConfiguration;
}

export async function predictiveSearch({
  storefront,
  shopId,
  planKey,
  term,
  config,
}: PredictiveArgs): Promise<PredictiveResult> {
  const empty: PredictiveResult = {
    term,
    redirect: null,
    products: [],
    collections: [],
    queries: [],
    totalSuggestions: 0,
  };

  if (term.length < config.minChars) return empty;

  // A redirect short-circuits everything — no point querying for suggestions
  // the shopper will never see.
  const redirect = await findRedirect(shopId, term, planKey);
  if (redirect) return { ...empty, redirect: redirect.targetUrl };

  const { query } = await expandSearchTerm(shopId, term, planKey);
  const limit = Math.min(Math.max(config.maxSuggestions, 1), 10);

  let wire: PredictiveWire | undefined;
  try {
    const response = await storefront.graphql(PREDICTIVE_SEARCH_QUERY, {
      variables: { query, limit },
    });
    const body = (await response.json()) as { data?: PredictiveWire; errors?: unknown };
    if (body.errors) {
      logger.error("storefront.predictive_failed", { errors: body.errors });
    }
    wire = body.data;
  } catch (error) {
    logger.error("storefront.predictive_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return empty;
  }

  const predictive = wire?.predictiveSearch;
  if (!predictive) return empty;

  const products: SuggestionProduct[] = (predictive.products ?? [])
    .slice(0, limit)
    .map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      url: `/products/${product.handle}`,
      image: config.showImages && product.featuredImage
        ? {
            url: product.featuredImage.url,
            altText: product.featuredImage.altText ?? null,
          }
        : null,
      price: config.showPrices
        ? (product.priceRange?.minVariantPrice.amount ?? null)
        : null,
      currency: config.showPrices
        ? (product.priceRange?.minVariantPrice.currencyCode ?? null)
        : null,
      vendor: config.showVendors ? (product.vendor ?? null) : null,
      productType: config.showProductTypes ? (product.productType ?? null) : null,
    }));

  const collections: SuggestionCollection[] = config.showCollections
    ? (predictive.collections ?? []).slice(0, limit).map((collection) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        url: `/collections/${collection.handle}`,
        image: collection.image
          ? { url: collection.image.url, altText: collection.image.altText ?? null }
          : null,
      }))
    : [];

  const custom = await findCustomSuggestions(shopId, term, planKey, limit);
  const queries = [
    ...custom.map((suggestion) => suggestion.term),
    ...(predictive.queries ?? []).map((entry) => entry.text),
  ]
    // Custom suggestions come first but must not duplicate Shopify's.
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, limit);

  return {
    term,
    redirect: null,
    products,
    collections,
    queries,
    totalSuggestions: products.length + collections.length + queries.length,
  };
}
