/** Pricing and billing (CLAUDE.md §36-§37, Phase 15). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  cancelSubscription,
  isTestBilling,
  startSubscription,
  syncSubscription,
} from "../services/billing/billing.server";
import { getSubscription, getUsage } from "../models/usage.server";
import { recordActivity } from "../models/activity.server";
import { PLANS, PLAN_KEYS, getPlan, isPlanKey } from "../config/plans";
import { UsageMeter } from "../components/admin/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop } = await requireAdminContext(request);
  const url = new URL(request.url);

  // Shopify redirects here after the merchant approves a charge; reconcile then.
  const planKey = url.searchParams.get("billing") ? await syncSubscription(admin, shop.id) : null;

  const [subscription, usage] = await Promise.all([
    getSubscription(shop.id),
    getUsage(shop.id),
  ]);

  return {
    justChanged: Boolean(planKey),
    testMode: isTestBilling(),
    current: {
      plan: subscription.plan,
      planName: getPlan(subscription.plan).name,
      status: subscription.status,
      hasShopifySubscription: Boolean(subscription.shopifyGid),
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    },
    usage,
    plans: PLAN_KEYS.map((key) => {
      const plan = PLANS[key];
      return {
        key: plan.key,
        name: plan.name,
        amount: plan.amount,
        currencyCode: plan.currencyCode,
        trialDays: plan.trialDays,
        tagline: plan.tagline,
        features: plan.features,
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "cancel") {
    const subscription = await getSubscription(shop.id);
    if (!subscription.shopifyGid) {
      return { error: "There is no active paid subscription to cancel." };
    }

    const error = await cancelSubscription(admin, shop.id, subscription.shopifyGid);
    if (error) return { error };

    await recordActivity({
      shopId: shop.id,
      action: "billing.cancelled",
      summary: "Cancelled the paid subscription",
    });
    return redirect("/app/pricing?billing=cancelled");
  }

  const planKey = String(formData.get("plan") ?? "");
  if (!isPlanKey(planKey)) return { error: "Unknown plan." };

  if (PLANS[planKey].amount === 0) {
    // Downgrading to Free means cancelling the Shopify subscription.
    const subscription = await getSubscription(shop.id);
    if (subscription.shopifyGid) {
      const error = await cancelSubscription(admin, shop.id, subscription.shopifyGid);
      if (error) return { error };
    }
    await recordActivity({
      shopId: shop.id,
      action: "billing.downgraded",
      summary: "Moved to the Free plan",
    });
    return redirect("/app/pricing?billing=free");
  }

  const appUrl = process.env.SHOPIFY_APP_URL ?? "";
  const returnUrl = `${appUrl}/app/pricing?billing=${planKey}&shop=${shop.domain}`;

  const { confirmationUrl, error } = await startSubscription(admin, planKey, returnUrl);
  if (error || !confirmationUrl) {
    return { error: error ?? "Could not start the subscription." };
  }

  await recordActivity({
    shopId: shop.id,
    action: "billing.requested",
    summary: `Requested the ${PLANS[planKey].name} plan`,
  });

  // Shopify's confirmation page is outside the embedded frame.
  return redirect(confirmationUrl);
};

export default function Pricing() {
  const { plans, current, usage, testMode, justChanged } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <s-page heading="Pricing">
      {justChanged || searchParams.get("billing") ? (
        <s-banner tone="success" heading="Plan updated">
          <s-paragraph>
            You are on the <strong>{current.planName}</strong> plan.
          </s-paragraph>
        </s-banner>
      ) : null}

      {testMode ? (
        <s-banner tone="info" heading="Test billing is on">
          <s-paragraph>
            Subscriptions created here are test charges and will not bill the
            merchant. Unset <code>SHOPIFY_BILLING_TEST</code> for production.
          </s-paragraph>
        </s-banner>
      ) : null}

      {actionData?.error ? (
        <s-banner tone="critical" heading="Billing error">
          <s-paragraph>{actionData.error}</s-paragraph>
        </s-banner>
      ) : null}

      <s-section heading="Plans">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
          {plans.map((plan) => {
            const isCurrent = plan.key === current.plan;

            return (
              <s-box
                key={plan.key}
                padding="base"
                borderWidth={isCurrent ? "large" : "base"}
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small-400">
                    <s-heading>{plan.name}</s-heading>
                    {isCurrent ? <s-badge tone="success">Current</s-badge> : null}
                  </s-stack>

                  <s-heading>
                    {plan.amount === 0
                      ? "Free"
                      : `$${plan.amount}/month`}
                  </s-heading>

                  <s-paragraph>{plan.tagline}</s-paragraph>

                  {plan.trialDays > 0 && !isCurrent ? (
                    <s-badge tone="info">{plan.trialDays}-day free trial</s-badge>
                  ) : null}

                  <s-unordered-list>
                    {plan.features.map((feature) => (
                      <s-list-item key={feature}>{feature}</s-list-item>
                    ))}
                  </s-unordered-list>

                  {isCurrent ? (
                    <s-button disabled>Current plan</s-button>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="plan" value={plan.key} />
                      <s-button type="submit" variant="primary">
                        {plan.amount === 0 ? "Switch to Free" : `Choose ${plan.name}`}
                      </s-button>
                    </Form>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>
      </s-section>

      <s-section slot="aside" heading="Monthly usage">
        <s-stack direction="block" gap="base">
          <UsageMeter
            label="Searches"
            used={usage.searches}
            limit={usage.limits.searches}
          />
          <UsageMeter
            label="Filter interactions"
            used={usage.filterInteractions}
            limit={usage.limits.filterInteractions}
          />
          <s-text color="subdued">Period {usage.periodKey}</s-text>

          {usage.overSearches || usage.overFilterInteractions ? (
            <s-banner tone="warning" heading="Limit reached">
              <s-paragraph>
                Analytics recording is paused for the rest of the month. Filtering and
                search continue to work normally for your shoppers.
              </s-paragraph>
            </s-banner>
          ) : null}
        </s-stack>
      </s-section>

      {current.hasShopifySubscription ? (
        <s-section slot="aside" heading="Subscription">
          <s-stack direction="block" gap="base">
            <s-text color="subdued">Status</s-text>
            <s-text>{current.status}</s-text>
            {current.currentPeriodEnd ? (
              <>
                <s-text color="subdued">Renews</s-text>
                <s-text>
                  {new Date(current.currentPeriodEnd).toLocaleDateString()}
                </s-text>
              </>
            ) : null}
            <Form
              method="post"
              onSubmit={(event) => {
                if (!window.confirm("Cancel your paid plan and return to Free?")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="cancel" />
              <s-button type="submit" variant="tertiary" tone="critical">
                Cancel subscription
              </s-button>
            </Form>
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}
