/**
 * Shop lifecycle (CLAUDE.md §5.3, Phase 2).
 *
 * Everything downstream keys off the `Shop.id` returned here. Callers must
 * derive the domain from an authenticated Shopify session or a verified app
 * proxy signature — never from request input.
 */

import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { logger } from "../lib/logger.server";
import { DEFAULT_PLAN } from "../config/plans";

export async function getShopByDomain(domain: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { domain } });
}

/**
 * Upserts the shop record and guarantees its singleton child rows exist.
 * Safe to call on every admin request — it is a single upsert plus at most
 * three no-op `createMany`-style writes on first install.
 */
export async function ensureShop(
  domain: string,
  attributes: Partial<
    Pick<Shop, "name" | "email" | "currencyCode" | "planName" | "scopes">
  > = {},
): Promise<Shop> {
  const shop = await prisma.shop.upsert({
    where: { domain },
    // Re-installing clears the uninstall marker so the merchant keeps their setup.
    update: { ...attributes, uninstalledAt: null },
    create: { domain, ...attributes },
  });

  await ensureShopDefaults(shop.id);
  return shop;
}

/** Creates the per-shop singleton rows if they are missing. Idempotent. */
export async function ensureShopDefaults(shopId: string): Promise<void> {
  await Promise.all([
    prisma.searchConfiguration.upsert({
      where: { shopId },
      update: {},
      create: { shopId },
    }),
    prisma.appSettings.upsert({
      where: { shopId },
      update: {},
      create: { shopId },
    }),
    prisma.subscription.upsert({
      where: { shopId },
      update: {},
      create: { shopId, plan: DEFAULT_PLAN, status: "active" },
    }),
  ]);
}

/**
 * Soft-delete on uninstall so a re-install restores the merchant's configuration.
 * A retention job hard-deletes afterwards; GDPR `shop/redact` deletes immediately.
 */
export async function markShopUninstalled(domain: string): Promise<void> {
  await prisma.shop.updateMany({
    where: { domain },
    data: { uninstalledAt: new Date() },
  });
  logger.info("shop.uninstalled", { domain });
}

export async function updateShopScopes(
  domain: string,
  scopes: string,
): Promise<void> {
  await prisma.shop.updateMany({ where: { domain }, data: { scopes } });
}

export async function markOnboarded(shopId: string): Promise<void> {
  await prisma.shop.update({
    where: { id: shopId },
    data: { onboardedAt: new Date() },
  });
}

/** Hard delete — used by `shop/redact` and the retention job. */
export async function purgeShop(domain: string): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return;

  // Analytics tables have no FK relation (they are written by the storefront
  // proxy at high volume), so they are cleared explicitly.
  await prisma.$transaction([
    prisma.searchEvent.deleteMany({ where: { shopId: shop.id } }),
    prisma.filterEvent.deleteMany({ where: { shopId: shop.id } }),
    prisma.searchTermStat.deleteMany({ where: { shopId: shop.id } }),
    prisma.filterUsageStat.deleteMany({ where: { shopId: shop.id } }),
    prisma.shop.delete({ where: { id: shop.id } }),
  ]);

  logger.info("shop.purged", { domain });
}
