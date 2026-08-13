/**
 * GDPR: shop/redact (CLAUDE.md §5.3, §6.5).
 *
 * Fired 48 hours after uninstall. Unlike `app/uninstalled`, which soft-deletes
 * so a re-install restores the merchant's setup, this is a hard delete of every
 * row belonging to the shop.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { purgeShop } from "../models/shop.server";
import { invalidateShop } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  logger.info("webhook.gdpr_shop_redact", { topic, shop });

  await purgeShop(shop);
  await db.session.deleteMany({ where: { shop } });
  invalidateShop(shop);

  return new Response();
};
