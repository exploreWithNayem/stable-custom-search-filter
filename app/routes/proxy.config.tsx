/**
 * GET /apps/scfs/config?collection=<handle>
 *
 * Filter + search configuration for a storefront context. Cacheable: it only
 * changes when a merchant saves, so it carries an ETag and a real max-age.
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  checkRateLimit,
  notModified,
  proxyJson,
  rateLimitKey,
  requireProxyContext,
  tooManyRequests,
  weakEtag,
} from "../lib/proxy.server";
import { resolveFilterConfig } from "../services/filters/resolve.server";
import { getSearchConfig } from "../models/search.server";
import { getSettings } from "../models/settings.server";
import { getPlanForShop } from "../models/usage.server";
import { configCache, TTL, cacheKey } from "../lib/cache.server";
import { PER_PAGE_OPTIONS, SORT_OPTIONS } from "../lib/filter-url";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requireProxyContext(request);

  if (!checkRateLimit(rateLimitKey(context, "config"), { capacity: 30 })) {
    return tooManyRequests();
  }

  const collectionHandle = context.url.searchParams.get("collection");
  const key = cacheKey(context.shop.domain, "config", collectionHandle);

  const { value: payload } = await configCache.remember(key, TTL.config, async () => {
    const [filterConfig, searchConfig, settings, plan] = await Promise.all([
      resolveFilterConfig(context.shop.id, collectionHandle),
      getSearchConfig(context.shop.id),
      getSettings(context.shop.id),
      getPlanForShop(context.shop.id),
    ]);

    return {
      // The Products & filter block replaces the theme's product section, so
      // the app renders the results on every page it is placed on. Engine
      // Native's "let the theme render them" path has no surface left to run
      // on; `nativeEligible` is reported so the admin can still tell a
      // merchant which of their filters Shopify could not express itself.
      engine: "app" as const,
      nativeEligible: filterConfig.nativeEligible,
      layout: filterConfig.layout,
      mobileLayout: settings.general.mobileLayout,
      source: filterConfig.source,
      collectionHandle,
      filters: filterConfig.filters.map((filter) => ({
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
      })),
      search: {
        enabled: searchConfig.enabled,
        placeholder: searchConfig.placeholder,
        minChars: searchConfig.minChars,
        debounceMs: searchConfig.debounceMs,
        maxSuggestions: searchConfig.maxSuggestions,
        showViewAll: searchConfig.showViewAll,
        noResultsText: searchConfig.noResultsText,
        // Tier 2 requires the plan; the theme falls back to /search/suggest.json.
        tier: plan.entitlements.predictiveSearchPlus ? 2 : 1,
      },
      toolbar: {
        showProductCount: settings.general.showProductCount,
        showClearAll: settings.general.showClearAll,
        showActiveFilters: settings.general.showActiveFilters,
        showSort: settings.general.showSort,
        showPerPage: settings.general.showPerPage,
        paginationStyle: settings.general.paginationStyle,
        perPageOptions: PER_PAGE_OPTIONS,
        defaultPerPage: settings.general.defaultPerPage,
        sortOptions: SORT_OPTIONS,
        columns: settings.general.columns,
        mobileDrawer: settings.general.mobileDrawer,
      },
      appearance: settings.appearance,
      analytics: {
        trackSearches: settings.analytics.trackSearches,
        trackFilters: settings.analytics.trackFilters,
      },
    };
  });

  const body = JSON.stringify(payload);
  const etag = weakEtag(body);

  const cached = notModified(request, etag);
  if (cached) return cached;

  return proxyJson(payload, { maxAge: 60, etag });
};
