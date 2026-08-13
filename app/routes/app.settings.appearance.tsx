/** Appearance settings (CLAUDE.md §13.5, Phase 16). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { getSettings, updateAppearanceSettings } from "../models/settings.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  appearanceSettingsSchema,
  formToObject,
  parseInput,
} from "../lib/validation";
import { planAllows } from "../config/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);

  return {
    appearance: settings.appearance,
    canCustomise: planAllows(plan.key, "customAppearance"),
    planName: plan.name,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);

  if (!planAllows(plan.key, "customAppearance")) {
    return {
      errors: { _form: "Appearance customisation requires the Standard plan." },
    };
  }

  const raw = formToObject(await request.formData());
  for (const key of ["borderRadius", "swatchSize"]) {
    if (typeof raw[key] === "string") raw[key] = Number(raw[key]);
  }

  const parsed = parseInput(appearanceSettingsSchema, raw);
  if (!parsed.ok) return { errors: parsed.errors };

  await updateAppearanceSettings(shop.id, parsed.data);

  await recordActivity({
    shopId: shop.id,
    action: "settings.updated",
    summary: "Updated appearance settings",
  });
  invalidateShop(shop.domain);

  return { ok: true };
};

export default function AppearanceSettings() {
  const { appearance, canCustomise, planName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? {};

  return (
    <s-page heading="Appearance">
      <s-button slot="back-action" href="/app/settings">
        Settings
      </s-button>

      {actionData?.ok ? <s-banner tone="success" heading="Saved" /> : null}

      <Form method="post">
        <s-section heading="Storefront styling">
          {!canCustomise ? (
            <s-banner tone="info" heading={`Not available on the ${planName} plan`}>
              <s-button href="/app/pricing">View plans</s-button>
            </s-banner>
          ) : null}

          <s-stack direction="block" gap="base">
            <s-text-field
              name="filterTitle"
              label="Filters heading"
              value={appearance.filterTitle}
              error={errors.filterTitle}
            />
            <s-select
              name="filterPosition"
              label="Filter position"
              value={appearance.filterPosition}
            >
              <s-option value="left">Left</s-option>
              <s-option value="right">Right</s-option>
            </s-select>
            <s-select
              name="filterSpacing"
              label="Spacing"
              value={appearance.filterSpacing}
            >
              <s-option value="compact">Compact</s-option>
              <s-option value="base">Default</s-option>
              <s-option value="loose">Loose</s-option>
            </s-select>
            <s-color-field
              name="accentColor"
              label="Accent colour"
              value={appearance.accentColor}
              error={errors.accentColor}
            />
            <s-number-field
              name="borderRadius"
              label="Corner radius"
              value={String(appearance.borderRadius)}
              min={0}
              max={24}
            />
            <s-number-field
              name="swatchSize"
              label="Swatch size (px)"
              value={String(appearance.swatchSize)}
              min={16}
              max={64}
            />
            <s-text-area
              name="customCss"
              label="Custom CSS"
              details="Applied inside the app's own scope. Use sparingly."
              value={appearance.customCss}
              rows={5}
            />

            {errors._form ? (
              <s-banner tone="critical" heading="Could not save">
                <s-paragraph>{errors._form}</s-paragraph>
              </s-banner>
            ) : null}

            <s-button type="submit" variant="primary" disabled={!canCustomise || undefined}>
              Save
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}
