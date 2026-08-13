/**
 * GDPR: customers/data_request (CLAUDE.md §6.5).
 *
 * This app stores no customer-identifying data. Analytics session identifiers
 * are salted SHA-256 hashes with no reverse mapping, so there is nothing that
 * can be attributed to a named customer and nothing to return.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logger } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info("webhook.gdpr_data_request", {
    topic,
    shop,
    note: "no customer-identifying data stored",
  });

  return new Response();
};
