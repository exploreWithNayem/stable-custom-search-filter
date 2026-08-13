/**
 * Subscription state and monthly usage metering (CLAUDE.md §15).
 *
 * Limits are enforced here, server-side. The degradation rule matters: going
 * over quota stops *recording* and disables premium enhancements, it never
 * breaks storefront filtering.
 */

import type { Subscription } from "@prisma/client";
import prisma from "../db.server";
import {
  DEFAULT_PLAN,
  getPlan,
  planLimit,
  type PlanDefinition,
  type PlanKey,
} from "../config/plans";

export type UsageMetric = "searches" | "filterInteractions";

/** "YYYY-MM" in UTC — the metering period key. */
export function currentPeriodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getSubscription(shopId: string): Promise<Subscription> {
  return prisma.subscription.upsert({
    where: { shopId },
    update: {},
    create: { shopId, plan: DEFAULT_PLAN, status: "active" },
  });
}

export async function getPlanForShop(shopId: string): Promise<PlanDefinition> {
  const subscription = await getSubscription(shopId);
  // A lapsed subscription falls back to Free rather than keeping paid features.
  const effective =
    subscription.status === "active" ? subscription.plan : DEFAULT_PLAN;
  return getPlan(effective);
}

export async function setSubscriptionPlan(
  shopId: string,
  plan: PlanKey,
  attributes: Partial<
    Pick<
      Subscription,
      "status" | "shopifyGid" | "test" | "trialEndsAt" | "currentPeriodEnd"
    >
  > = {},
): Promise<Subscription> {
  return prisma.subscription.upsert({
    where: { shopId },
    update: { plan, ...attributes },
    create: { shopId, plan, status: "active", ...attributes },
  });
}

export interface UsageSnapshot {
  periodKey: string;
  searches: number;
  filterInteractions: number;
  limits: {
    searches: number | null;
    filterInteractions: number | null;
  };
  overSearches: boolean;
  overFilterInteractions: boolean;
}

export async function getUsage(
  shopId: string,
  planKey?: string,
): Promise<UsageSnapshot> {
  const periodKey = currentPeriodKey();
  const [row, plan] = await Promise.all([
    prisma.usage.findUnique({ where: { shopId_periodKey: { shopId, periodKey } } }),
    planKey ? Promise.resolve(getPlan(planKey)) : getPlanForShop(shopId),
  ]);

  const searches = row?.searches ?? 0;
  const filterInteractions = row?.filterInteractions ?? 0;
  const searchLimit = plan.limits.monthlySearches;
  const filterLimit = plan.limits.monthlyFilterInteractions;

  return {
    periodKey,
    searches,
    filterInteractions,
    limits: { searches: searchLimit, filterInteractions: filterLimit },
    overSearches: searchLimit !== null && searches >= searchLimit,
    overFilterInteractions:
      filterLimit !== null && filterInteractions >= filterLimit,
  };
}

/**
 * Increments a usage counter. Returns `false` when the shop is already at its
 * limit, in which case the caller should skip recording (but must still serve
 * the storefront request).
 */
export async function consumeUsage(
  shopId: string,
  metric: UsageMetric,
  amount = 1,
): Promise<boolean> {
  const plan = await getPlanForShop(shopId);
  const limit =
    metric === "searches"
      ? plan.limits.monthlySearches
      : plan.limits.monthlyFilterInteractions;

  const periodKey = currentPeriodKey();

  if (limit !== null) {
    const existing = await prisma.usage.findUnique({
      where: { shopId_periodKey: { shopId, periodKey } },
    });
    const current = existing?.[metric] ?? 0;
    if (current + amount > limit) return false;
  }

  await prisma.usage.upsert({
    where: { shopId_periodKey: { shopId, periodKey } },
    update: { [metric]: { increment: amount } },
    create: { shopId, periodKey, [metric]: amount },
  });

  return true;
}

export function usageLimitFor(
  planKey: string | null | undefined,
  metric: UsageMetric,
): number | null {
  return metric === "searches"
    ? planLimit(planKey, "monthlySearches")
    : planLimit(planKey, "monthlyFilterInteractions");
}
