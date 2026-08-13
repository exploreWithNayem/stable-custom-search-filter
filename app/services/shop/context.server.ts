/**
 * Authenticated admin request context (CLAUDE.md §16, Phase 2).
 *
 * Every admin loader/action starts here. The returned `shop.id` is the only
 * shop identifier the rest of the app is allowed to use.
 */

import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Shop } from "@prisma/client";
import { authenticate } from "../../shopify.server";
import { ensureShop } from "../../models/shop.server";
import { getPlanForShop } from "../../models/usage.server";
import type { PlanDefinition } from "../../config/plans";

export interface AdminContext {
  admin: AdminApiContext;
  session: Session;
  shop: Shop;
  plan: PlanDefinition;
}

/**
 * Authenticates, upserts the shop record, and resolves the effective plan.
 *
 * `authenticate.admin` throws a redirect/401 Response for unauthenticated
 * requests, which React Router propagates — so callers can assume success.
 */
export async function requireAdminContext(
  request: Request,
): Promise<AdminContext> {
  const { admin, session } = await authenticate.admin(request);

  const shop = await ensureShop(session.shop, {
    scopes: session.scope ?? null,
  });
  const plan = await getPlanForShop(shop.id);

  return { admin, session, shop, plan };
}

/**
 * Lighter variant for routes that only touch the database. Still fully
 * authenticated — it just avoids resolving the plan.
 */
export async function requireShop(
  request: Request,
): Promise<{ shop: Shop; session: Session; admin: AdminApiContext }> {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, { scopes: session.scope ?? null });
  return { shop, session, admin };
}
