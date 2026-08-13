/**
 * GDPR: customers/redact (CLAUDE.md §6.5).
 *
 * Nothing to erase: no row in this app references a customer. Session hashes
 * are one-way and unlinkable to a customer id, which is why they were designed
 * that way (§14.1).
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logger } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info("webhook.gdpr_customer_redact", {
    topic,
    shop,
    note: "no customer records to erase",
  });

  return new Response();
};
