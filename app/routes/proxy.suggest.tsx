/**
 * GET /apps/scfs/suggest?q=<term>
 *
 * Tier 2 predictive search. Shops without the entitlement get a 204 so the
 * theme falls back to the native `/search/suggest.json` path rather than
 * rendering an error (CLAUDE.md §11.2).
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  checkRateLimit,
  proxyJson,
  rateLimitKey,
  requireProxyContext,
  tooManyRequests,
} from "../lib/proxy.server";
import { predictiveSearch } from "../services/search/predictive.server";
import { getSearchConfig } from "../models/search.server";
import { getPlanForShop } from "../models/usage.server";
import { cacheKey, suggestCache, TTL } from "../lib/cache.server";
import { MAX_TERM_LENGTH } from "../lib/filter-url";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await requireProxyContext(request);

  // Predictive search fires on nearly every keystroke, so its bucket is larger
  // than the others but still bounded.
  if (!checkRateLimit(rateLimitKey(context, "suggest"), { capacity: 120, refillPerSecond: 4 })) {
    return tooManyRequests();
  }

  const term = (context.url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_TERM_LENGTH);

  const [config, plan] = await Promise.all([
    getSearchConfig(context.shop.id),
    getPlanForShop(context.shop.id),
  ]);

  if (!config.enabled) return new Response(null, { status: 204 });
  if (!plan.entitlements.predictiveSearchPlus) {
    return new Response(null, { status: 204 });
  }
  if (term.length < config.minChars) {
    return proxyJson({
      term,
      redirect: null,
      products: [],
      collections: [],
      queries: [],
      totalSuggestions: 0,
    });
  }

  const key = cacheKey(context.shop.domain, "suggest", term.toLowerCase());
  const { value: result } = await suggestCache.remember(key, TTL.suggest, () =>
    predictiveSearch({
      storefront: context.storefront,
      shopId: context.shop.id,
      planKey: plan.key,
      term,
      config,
    }),
  );

  return proxyJson(result, { maxAge: 30 });
};
