/** General, appearance and analytics settings (CLAUDE.md §21/§26, Phase 16). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  getSettings,
  updateAnalyticsSettings,
  updateAppearanceSettings,
  updateGeneralSettings,
} from "../models/settings.server";
import { pruneRawEvents } from "../models/analytics.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  ENGINES,
  LAYOUTS,
  analyticsSettingsSchema,
  appearanceSettingsSchema,
  formToObject,
  generalSettingsSchema,
  parseInput,
} from "../lib/validation";
import { PER_PAGE_OPTIONS } from "../lib/filter-url";
import { planAllows } from "../config/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);

  return {
    settings,
    canCustomise: planAllows(plan.key, "customAppearance"),
    planName: plan.name,
    retentionCap: plan.limits.analyticsRetentionDays,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const raw = formToObject(formData);

  if (intent === "general") {
    for (const key of ["defaultPerPage", "columns"]) {
      if (typeof raw[key] === "string") raw[key] = Number(raw[key]);
    }
    const parsed = parseInput(generalSettingsSchema, raw);
    if (!parsed.ok) return { errors: parsed.errors, scope: "general" as const };

    await updateGeneralSettings(shop.id, parsed.data);
  } else if (intent === "appearance") {
    if (!planAllows(plan.key, "customAppearance")) {
      return {
        errors: { _form: "Appearance customisation requires the Standard plan." },
        scope: "appearance" as const,
      };
    }
    for (const key of ["borderRadius", "swatchSize"]) {
      if (typeof raw[key] === "string") raw[key] = Number(raw[key]);
    }
    const parsed = parseInput(appearanceSettingsSchema, raw);
    if (!parsed.ok) return { errors: parsed.errors, scope: "appearance" as const };

    await updateAppearanceSettings(shop.id, parsed.data);
  } else if (intent === "analytics") {
    if (typeof raw.retentionDays === "string") {
      raw.retentionDays = Number(raw.retentionDays);
    }
    const parsed = parseInput(analyticsSettingsSchema, raw);
    if (!parsed.ok) return { errors: parsed.errors, scope: "analytics" as const };

    // The plan caps retention; a longer request is clamped rather than rejected.
    const retentionDays = Math.min(
      parsed.data.retentionDays,
      plan.limits.analyticsRetentionDays,
    );

    await updateAnalyticsSettings(shop.id, { ...parsed.data, retentionDays });
  } else if (intent === "prune") {
    const settings = await getSettings(shop.id);
    const removed = await pruneRawEvents(shop.id, settings.analytics.retentionDays);

    await recordActivity({
      shopId: shop.id,
      action: "analytics.pruned",
      summary: `Pruned ${removed.searches + removed.filters} raw events`,
      actor: "merchant",
    });

    return { ok: true, scope: "analytics" as const, pruned: removed };
  }

  await recordActivity({
    shopId: shop.id,
    action: "settings.updated",
    summary: `Updated ${intent} settings`,
  });
  invalidateShop(shop.domain);

  return { ok: true, scope: intent as "general" | "appearance" | "analytics" };
};

function BooleanField({
  name,
  label,
  checked,
  details,
}: {
  name: string;
  label: string;
  checked: boolean;
  details?: string;
}) {
  return (
    <>
      <input type="hidden" name={name} value="false" />
      <s-checkbox
        name={name}
        value="true"
        label={label}
        details={details}
        checked={checked || undefined}
      />
    </>
  );
}

export default function Settings() {
  const { settings, canCustomise, planName, retentionCap } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const errorsFor = (scope: string) =>
    actionData?.scope === scope ? (actionData.errors ?? {}) : {};

  const generalErrors = errorsFor("general");
  const appearanceErrors = errorsFor("appearance");
  const analyticsErrors = errorsFor("analytics");

  return (
    <s-page heading="Settings">
      {actionData?.ok ? <s-banner tone="success" heading="Saved" /> : null}

      <Form method="post">
        <input type="hidden" name="intent" value="general" />
        <s-section heading="General">
          <s-stack direction="block" gap="base">
            <s-select name="engine" label="Filtering engine" value={settings.general.engine}>
              {ENGINES.map((engine) => (
                <s-option key={engine} value={engine}>
                  {engine === "auto"
                    ? "Automatic (recommended)"
                    : engine === "native"
                      ? "Native — Shopify filtering, fastest"
                      : "App — full control, one request per change"}
                </s-option>
              ))}
            </s-select>

            <s-banner tone="info" heading="How automatic works">
              <s-paragraph>
                Automatic uses Shopify&apos;s own filtering whenever every filter on a
                page can be expressed natively — no app requests, and your theme
                renders the products. It switches to the app engine only when a filter
                needs it.
              </s-paragraph>
            </s-banner>

            <s-select
              name="defaultLayout"
              label="Default layout"
              value={settings.general.defaultLayout}
            >
              {LAYOUTS.map((layout) => (
                <s-option key={layout} value={layout}>
                  {layout.charAt(0).toUpperCase() + layout.slice(1)}
                </s-option>
              ))}
            </s-select>

            <s-select
              name="defaultPerPage"
              label="Products per page"
              value={String(settings.general.defaultPerPage)}
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <s-option key={option} value={String(option)}>
                  {option}
                </s-option>
              ))}
            </s-select>

            <s-number-field
              name="columns"
              label="Grid columns on desktop"
              value={String(settings.general.columns)}
              min={2}
              max={5}
              error={generalErrors.columns}
            />

            <s-select
              name="paginationStyle"
              label="Pagination"
              value={settings.general.paginationStyle}
            >
              <s-option value="numbered">Numbered pages</s-option>
              <s-option value="load_more">Load more button</s-option>
            </s-select>

            <s-divider />

            <BooleanField
              name="showProductCount"
              label="Show product count"
              checked={settings.general.showProductCount}
            />
            <BooleanField
              name="showClearAll"
              label="Show clear all"
              checked={settings.general.showClearAll}
            />
            <BooleanField
              name="showActiveFilters"
              label="Show active filter chips"
              checked={settings.general.showActiveFilters}
            />
            <BooleanField
              name="showSort"
              label="Show sort control"
              checked={settings.general.showSort}
            />
            <BooleanField
              name="showPerPage"
              label="Show products-per-page control"
              checked={settings.general.showPerPage}
            />
            <BooleanField
              name="mobileDrawer"
              label="Use a filter drawer on mobile"
              checked={settings.general.mobileDrawer}
            />

            <s-button type="submit" variant="primary">
              Save general settings
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <Form method="post">
        <input type="hidden" name="intent" value="appearance" />
        <s-section heading="Appearance">
          {!canCustomise ? (
            <s-banner tone="info" heading={`Not available on the ${planName} plan`}>
              <s-button href="/app/pricing">View plans</s-button>
            </s-banner>
          ) : null}

          <s-stack direction="block" gap="base">
            <s-text-field
              name="filterTitle"
              label="Filters heading"
              value={settings.appearance.filterTitle}
              error={appearanceErrors.filterTitle}
            />
            <s-select
              name="filterPosition"
              label="Sidebar position"
              value={settings.appearance.filterPosition}
            >
              <s-option value="left">Left</s-option>
              <s-option value="right">Right</s-option>
            </s-select>
            <s-select
              name="filterSpacing"
              label="Spacing"
              value={settings.appearance.filterSpacing}
            >
              <s-option value="compact">Compact</s-option>
              <s-option value="base">Default</s-option>
              <s-option value="loose">Loose</s-option>
            </s-select>
            <s-color-field
              name="accentColor"
              label="Accent colour"
              value={settings.appearance.accentColor}
              error={appearanceErrors.accentColor}
            />
            <s-number-field
              name="borderRadius"
              label="Corner radius"
              value={String(settings.appearance.borderRadius)}
              min={0}
              max={24}
            />
            <s-number-field
              name="swatchSize"
              label="Swatch size (px)"
              value={String(settings.appearance.swatchSize)}
              min={16}
              max={64}
            />
            <s-text-area
              name="customCss"
              label="Custom CSS"
              details="Applied inside the app's own scope. Use sparingly."
              value={settings.appearance.customCss}
              rows={5}
            />

            {appearanceErrors._form ? (
              <s-banner tone="critical" heading="Could not save">
                <s-paragraph>{appearanceErrors._form}</s-paragraph>
              </s-banner>
            ) : null}

            <s-button type="submit" variant="primary" disabled={!canCustomise || undefined}>
              Save appearance
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <Form method="post">
        <input type="hidden" name="intent" value="analytics" />
        <s-section heading="Analytics">
          <s-stack direction="block" gap="base">
            <BooleanField
              name="trackSearches"
              label="Track searches"
              checked={settings.analytics.trackSearches}
            />
            <BooleanField
              name="trackFilters"
              label="Track filter interactions"
              checked={settings.analytics.trackFilters}
            />
            <s-number-field
              name="retentionDays"
              label="Raw event retention (days)"
              details={`Your plan allows up to ${retentionCap} days. Daily totals are kept regardless.`}
              value={String(settings.analytics.retentionDays)}
              min={1}
              max={365}
              error={analyticsErrors.retentionDays}
            />
            <s-button type="submit" variant="primary">
              Save analytics settings
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
        {actionData?.scope === "analytics" && actionData.pruned ? (
          <s-paragraph>
            Removed {actionData.pruned.searches + actionData.pruned.filters} rows.
          </s-paragraph>
        ) : null}
      </s-section>

      <s-section slot="aside" heading="Setting precedence">
        <s-paragraph>Settings resolve in this order:</s-paragraph>
        <s-ordered-list>
          <s-list-item>Theme block setting</s-list-item>
          <s-list-item>Collection configuration</s-list-item>
          <s-list-item>These shop settings</s-list-item>
          <s-list-item>App defaults</s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}
