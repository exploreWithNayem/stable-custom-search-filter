import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopByDomain } from "../models/shop.server";
import { deleteCollectionFilterByGid } from "../models/collection.server";
import { invalidateShop } from "../lib/cache.server";
import { logger } from "../lib/logger.server";

interface CollectionDeletePayload {
  id?: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  logger.info("webhook.received", { topic, shop });

  const rawId = (payload as CollectionDeletePayload).id;
  const shopRecord = await getShopByDomain(shop);

  if (shopRecord && rawId !== undefined) {
    // The webhook payload carries a numeric id; our config stores the GID.
    await deleteCollectionFilterByGid(
      shopRecord.id,
      `gid://shopify/Collection/${rawId}`,
    );
  }

  invalidateShop(shop);

  return new Response();
};
