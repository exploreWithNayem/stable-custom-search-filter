import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { updateShopScopes } from "../models/shop.server";
import { logger } from "../lib/logger.server";

interface ScopesUpdatePayload {
  current?: string[] | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  logger.info("webhook.received", { topic, shop });

  const current = (payload as ScopesUpdatePayload).current;
  const scopes = Array.isArray(current) ? current.join(",") : (current ?? "");

  if (session) {
    await db.session.update({
      where: { id: session.id },
      data: { scope: scopes },
    });
  }

  await updateShopScopes(shop, scopes);

  return new Response();
};
