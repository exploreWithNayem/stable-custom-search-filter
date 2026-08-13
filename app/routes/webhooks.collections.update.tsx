import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { invalidateShop } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  logger.info("webhook.received", { topic, shop });

  invalidateShop(shop);

  return new Response();
};
