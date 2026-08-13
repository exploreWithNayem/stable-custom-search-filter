/**
 * Shopify billing (CLAUDE.md §15, Phase 15).
 *
 * Plan definitions live in `app/config/plans.ts` and are read from there
 * — never restated here (D11). This module only translates them into Shopify
 * subscription calls and reconciles the result into our `Subscription` row.
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  DEFAULT_PLAN,
  PLANS,
  type PlanKey,
} from "../../config/plans";
import { setSubscriptionPlan } from "../../models/usage.server";
import { logger } from "../../lib/logger.server";

const CREATE_SUBSCRIPTION = /* GraphQL */ `
  mutation CreateSubscription(
    $name: String!
    $returnUrl: URL!
    $test: Boolean!
    $trialDays: Int!
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CANCEL_SUBSCRIPTION = /* GraphQL */ `
  mutation CancelSubscription($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVE_SUBSCRIPTIONS = /* GraphQL */ `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        currentPeriodEnd
        trialDays
      }
    }
  }
`;

export function isTestBilling(): boolean {
  return process.env.SHOPIFY_BILLING_TEST === "1";
}

export interface StartSubscriptionResult {
  confirmationUrl: string | null;
  error: string | null;
}

/**
 * Starts a paid subscription. Returns the confirmation URL the merchant must be
 * sent to — the plan is only persisted once Shopify redirects back and
 * `syncSubscription` confirms it is active.
 */
export async function startSubscription(
  admin: AdminApiContext,
  planKey: PlanKey,
  returnUrl: string,
): Promise<StartSubscriptionResult> {
  const plan = PLANS[planKey];

  if (plan.amount === 0) {
    return { confirmationUrl: null, error: "The Free plan does not require billing." };
  }

  try {
    const response = await admin.graphql(CREATE_SUBSCRIPTION, {
      variables: {
        name: `${plan.name} plan`,
        returnUrl,
        test: isTestBilling(),
        trialDays: plan.trialDays,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.amount, currencyCode: plan.currencyCode },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    });

    const body = (await response.json()) as {
      data?: {
        appSubscriptionCreate: {
          confirmationUrl: string | null;
          appSubscription: { id: string; status: string } | null;
          userErrors: { field: string[] | null; message: string }[];
        };
      };
    };

    const result = body.data?.appSubscriptionCreate;
    const userError = result?.userErrors?.[0];
    if (userError) {
      logger.warn("billing.user_error", { message: userError.message });
      return { confirmationUrl: null, error: userError.message };
    }

    if (!result?.confirmationUrl) {
      return { confirmationUrl: null, error: "Shopify did not return a confirmation URL." };
    }

    return { confirmationUrl: result.confirmationUrl, error: null };
  } catch (error) {
    logger.error("billing.create_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { confirmationUrl: null, error: "Could not start the subscription." };
  }
}

export async function cancelSubscription(
  admin: AdminApiContext,
  shopId: string,
  subscriptionGid: string,
): Promise<string | null> {
  try {
    const response = await admin.graphql(CANCEL_SUBSCRIPTION, {
      variables: { id: subscriptionGid },
    });
    const body = (await response.json()) as {
      data?: {
        appSubscriptionCancel: {
          userErrors: { message: string }[];
        };
      };
    };

    const userError = body.data?.appSubscriptionCancel.userErrors?.[0];
    if (userError) return userError.message;

    await setSubscriptionPlan(shopId, DEFAULT_PLAN, {
      status: "cancelled",
      shopifyGid: null,
      currentPeriodEnd: null,
    });

    return null;
  } catch (error) {
    logger.error("billing.cancel_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return "Could not cancel the subscription.";
  }
}

/**
 * Reconciles our `Subscription` row with Shopify's truth. Called after the
 * billing return redirect and whenever the pricing page loads, so a plan
 * charged outside our flow still resolves correctly.
 */
export async function syncSubscription(
  admin: AdminApiContext,
  shopId: string,
): Promise<PlanKey> {
  try {
    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS);
    const body = (await response.json()) as {
      data?: {
        currentAppInstallation: {
          activeSubscriptions: {
            id: string;
            name: string;
            status: string;
            test: boolean;
            currentPeriodEnd: string | null;
          }[];
        };
      };
    };

    const active = body.data?.currentAppInstallation.activeSubscriptions.find(
      (subscription) => subscription.status === "ACTIVE",
    );

    if (!active) {
      await setSubscriptionPlan(shopId, DEFAULT_PLAN, {
        status: "active",
        shopifyGid: null,
        currentPeriodEnd: null,
      });
      return DEFAULT_PLAN;
    }

    // Shopify only knows the subscription name, so map it back to a plan key.
    const planKey =
      (Object.keys(PLANS) as PlanKey[]).find((key) =>
        active.name.toLowerCase().startsWith(PLANS[key].name.toLowerCase()),
      ) ?? DEFAULT_PLAN;

    await setSubscriptionPlan(shopId, planKey, {
      status: "active",
      shopifyGid: active.id,
      test: active.test,
      currentPeriodEnd: active.currentPeriodEnd
        ? new Date(active.currentPeriodEnd)
        : null,
    });

    return planKey;
  } catch (error) {
    logger.error("billing.sync_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return DEFAULT_PLAN;
  }
}
