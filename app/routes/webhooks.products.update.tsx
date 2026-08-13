import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { invalidateShop } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

/**
 * Product changes move prices, availability and option values, so cached facet
 * counts and product pages for this shop are dropped.
 *
 * Invalidation is shop-wide rather than per-collection: working out which
 * collections a product belongs to would cost an Admin API call per webhook,
 * which is more expensive than re-warming a 60s cache (CLAUDE.md §17).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  logger.info("webhook.received", { topic, shop });

  invalidateShop(shop);

  return new Response();
};
