/** Analytics and data settings (CLAUDE.md §13.5, §14, Phase 16). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { getSettings, updateAnalyticsSettings } from "../models/settings.server";
import { pruneRawEvents } from "../models/analytics.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  analyticsSettingsSchema,
  formToObject,
  parseInput,
} from "../lib/validation";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);

  return {
    analytics: settings.analytics,
    retentionCap: plan.limits.analyticsRetentionDays,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();

  if (String(formData.get("intent") ?? "") === "prune") {
    const settings = await getSettings(shop.id);
    const removed = await pruneRawEvents(shop.id, settings.analytics.retentionDays);

    await recordActivity({
      shopId: shop.id,
      action: "analytics.pruned",
      summary: `Pruned ${removed.searches + removed.filters} raw events`,
      actor: "merchant",
    });

    return { ok: true, pruned: removed };
  }

  const raw = formToObject(formData);
  if (typeof raw.retentionDays === "string") {
    raw.retentionDays = Number(raw.retentionDays);
  }

  const parsed = parseInput(analyticsSettingsSchema, raw);
  if (!parsed.ok) return { errors: parsed.errors };

  // The plan caps retention; a longer request is clamped rather than rejected.
  const retentionDays = Math.min(
    parsed.data.retentionDays,
    plan.limits.analyticsRetentionDays,
  );

  await updateAnalyticsSettings(shop.id, { ...parsed.data, retentionDays });

  await recordActivity({
    shopId: shop.id,
    action: "settings.updated",
    summary: "Updated analytics settings",
  });
  invalidateShop(shop.domain);

  return { ok: true };
};

function BooleanField({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <>
      <input type="hidden" name={name} value="false" />
      <s-checkbox name={name} value="true" label={label} checked={checked || undefined} />
    </>
  );
}

export default function AnalyticsSettings() {
  const { analytics, retentionCap } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? {};

  return (
    <s-page heading="Analytics and data">
      <s-button slot="back-action" href="/app/settings">
        Settings
      </s-button>

      {actionData?.ok ? <s-banner tone="success" heading="Saved" /> : null}

      <Form method="post">
        <s-section heading="Tracking">
          <s-stack direction="block" gap="base">
            <BooleanField
              name="trackSearches"
              label="Track searches"
              checked={analytics.trackSearches}
            />
            <BooleanField
              name="trackFilters"
              label="Track filter interactions"
              checked={analytics.trackFilters}
            />
            <s-number-field
              name="retentionDays"
              label="Raw event retention (days)"
              details={`Your plan allows up to ${retentionCap} days. Daily totals are kept regardless.`}
              value={String(analytics.retentionDays)}
              min={1}
              max={365}
              error={errors.retentionDays}
            />
            <s-button type="submit" variant="primary">
              Save
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <s-section slot="aside" heading="Data">
        <s-paragraph>
          Delete raw event rows older than your retention window now. Daily totals
          used by the dashboard are not affected.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="prune" />
          <s-button type="submit" variant="secondary">
            Prune old events
          </s-button>
        </Form>
        {actionData?.pruned ? (
          <s-paragraph>
            Removed {actionData.pruned.searches + actionData.pruned.filters} rows.
          </s-paragraph>
        ) : null}
      </s-section>
    </s-page>
  );
}
