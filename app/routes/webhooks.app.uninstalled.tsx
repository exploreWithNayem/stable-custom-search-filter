import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { markShopUninstalled } from "../models/shop.server";
import { invalidateShop } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  logger.info("webhook.received", { topic, shop });

  // Webhooks can be delivered more than once, and after the app is already
  // gone. Both branches below are idempotent.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Soft delete: a re-install restores the merchant's filters (shop.server.ts).
  await markShopUninstalled(shop);
  invalidateShop(shop);

  return new Response();
};
