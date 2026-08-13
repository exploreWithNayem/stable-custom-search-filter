/**
 * Plan definitions — the ONLY place pricing, quotas and feature gates are
 * declared (CLAUDE.md D11 / §15).
 *
 * Everything else (pricing page, billing calls, quota checks, feature gates)
 * reads from here. Never inline a price or a limit anywhere else.
 */

export const PLAN_KEYS = ["free", "standard", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "pending",
  "cancelled",
  "expired",
  "frozen",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Feature gates checked by `planAllows`. */
export const PLAN_FEATURES = [
  "metafieldFilters",
  "collectionFilters",
  "predictiveSearchPlus",
  "advancedAnalytics",
  "synonyms",
  "suggestions",
  "customAppearance",
  "prioritySupport",
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export interface PlanLimits {
  /** Maximum enabled filters. `null` = unlimited. */
  filters: number | null;
  /** Maximum filter groups. `null` = unlimited. */
  filterGroups: number | null;
  /** Maximum collections with custom configuration. `null` = unlimited. */
  configuredCollections: number | null;
  /** Monthly recorded searches. `null` = unlimited. */
  monthlySearches: number | null;
  /** Monthly recorded filter interactions. `null` = unlimited. */
  monthlyFilterInteractions: number | null;
  /** Days of raw event history retained. */
  analyticsRetentionDays: number;
}

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  /** Amount in the plan currency, per month. */
  amount: number;
  currencyCode: string;
  trialDays: number;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  entitlements: Record<PlanFeature, boolean>;
}

function entitlements(
  enabled: readonly PlanFeature[],
): Record<PlanFeature, boolean> {
  const result = {} as Record<PlanFeature, boolean>;
  for (const feature of PLAN_FEATURES) {
    result[feature] = enabled.includes(feature);
  }
  return result;
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: "free",
    name: "Free",
    amount: 0,
    currencyCode: "USD",
    trialDays: 0,
    tagline: "Everything you need to try filtering on your storefront.",
    features: [
      "Basic product filters",
      "Basic search",
      "Basic analytics",
      "Up to 5 filters",
    ],
    limits: {
      filters: 5,
      filterGroups: 2,
      configuredCollections: 1,
      monthlySearches: 1_000,
      monthlyFilterInteractions: 1_000,
      analyticsRetentionDays: 7,
    },
    entitlements: entitlements([]),
  },
  standard: {
    key: "standard",
    name: "Standard",
    amount: 19,
    currencyCode: "USD",
    trialDays: 7,
    tagline: "Metafield filters, predictive search and per-collection setups.",
    features: [
      "Advanced filters",
      "Metafield filters",
      "Predictive search",
      "Collection-specific filters",
      "Advanced analytics",
      "More customization",
    ],
    limits: {
      filters: 25,
      filterGroups: 10,
      configuredCollections: 25,
      monthlySearches: 10_000,
      monthlyFilterInteractions: 10_000,
      analyticsRetentionDays: 30,
    },
    entitlements: entitlements([
      "metafieldFilters",
      "collectionFilters",
      "predictiveSearchPlus",
      "advancedAnalytics",
      "customAppearance",
    ]),
  },
  pro: {
    key: "pro",
    name: "Pro",
    amount: 49,
    currencyCode: "USD",
    trialDays: 14,
    tagline: "Unlimited filters, synonyms and the full analytics suite.",
    features: [
      "Unlimited filters",
      "Advanced search",
      "Full analytics",
      "Search synonyms",
      "Search suggestions",
      "Advanced customization",
      "Priority support",
    ],
    limits: {
      filters: null,
      filterGroups: null,
      configuredCollections: null,
      monthlySearches: null,
      monthlyFilterInteractions: null,
      analyticsRetentionDays: 90,
    },
    entitlements: entitlements([
      "metafieldFilters",
      "collectionFilters",
      "predictiveSearchPlus",
      "advancedAnalytics",
      "synonyms",
      "suggestions",
      "customAppearance",
      "prioritySupport",
    ]),
  },
};

export const DEFAULT_PLAN: PlanKey = "free";

export const PAID_PLAN_KEYS: readonly PlanKey[] = PLAN_KEYS.filter(
  (key) => PLANS[key].amount > 0,
);

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

export function getPlan(key: string | null | undefined): PlanDefinition {
  return isPlanKey(key ?? "") ? PLANS[key as PlanKey] : PLANS[DEFAULT_PLAN];
}

export function planAllows(
  planKey: string | null | undefined,
  feature: PlanFeature,
): boolean {
  return getPlan(planKey).entitlements[feature];
}

export function planLimit<K extends keyof PlanLimits>(
  planKey: string | null | undefined,
  limit: K,
): PlanLimits[K] {
  return getPlan(planKey).limits[limit];
}

/** `true` when a numeric limit has been reached. Unlimited (`null`) never is. */
export function isOverLimit(
  planKey: string | null | undefined,
  limit: keyof PlanLimits,
  current: number,
): boolean {
  const max = getPlan(planKey).limits[limit];
  return typeof max === "number" && current >= max;
}

/** Billing line item for the Shopify subscription API. */
export function billingLineItem(planKey: PlanKey) {
  const plan = PLANS[planKey];
  return {
    amount: plan.amount,
    currencyCode: plan.currencyCode,
    interval: "EVERY_30_DAYS" as const,
    trialDays: plan.trialDays,
  };
}
