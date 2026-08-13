/** Edit a filter, including its value overrides (CLAUDE.md §35, Phase 5). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { loadBuilderData } from "../services/filters/builder.server";
import {
  getFilter,
  replaceFilterValues,
  updateFilter,
} from "../models/filter.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  filterInputSchema,
  filterValueInputSchema,
  formToObject,
  parseInput,
} from "../lib/validation";
import { FilterForm } from "../components/admin/FilterForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const filter = await getFilter(shop.id, params.id ?? "");

  // A filter id belonging to another shop resolves to nothing — never a record.
  if (!filter) throw new Response("Not found", { status: 404 });

  const builder = await loadBuilderData(admin, shop.id, plan);

  return {
    builder,
    filter: {
      id: filter.id,
      name: filter.name,
      handle: filter.handle,
      source: filter.source,
      sourceKey: filter.sourceKey,
      displayType: filter.displayType,
      groupId: filter.groupId,
      enabled: filter.enabled,
      multiSelect: filter.multiSelect,
      showCount: filter.showCount,
      hideEmpty: filter.hideEmpty,
      collapsedByDefault: filter.collapsedByDefault,
      searchableValues: filter.searchableValues,
      maxVisibleValues: filter.maxVisibleValues,
      valueSort: filter.valueSort,
      values: filter.values.map((value) => ({
        value: value.value,
        label: value.label,
        swatchColor: value.swatchColor,
        swatchImage: value.swatchImage,
        position: value.position,
        hidden: value.hidden,
        cachedCount: value.cachedCount,
      })),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const id = params.id ?? "";
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "values") {
    // Value overrides submit as parallel arrays, one entry per row.
    const rawValues = formData.getAll("value[]").map(String);
    const labels = formData.getAll("label[]").map(String);
    const colors = formData.getAll("swatchColor[]").map(String);
    const images = formData.getAll("swatchImage[]").map(String);
    const hidden = formData.getAll("hidden[]").map(String);

    const parsedValues = [];
    for (let index = 0; index < rawValues.length; index += 1) {
      const candidate = {
        value: rawValues[index],
        label: labels[index] || null,
        swatchColor: colors[index] || null,
        swatchImage: images[index] || null,
        position: index,
        hidden: hidden[index] === "true",
      };

      const parsed = parseInput(filterValueInputSchema, candidate);
      if (!parsed.ok) {
        return { errors: parsed.errors, scope: "values" as const };
      }
      parsedValues.push(parsed.data);
    }

    const ok = await replaceFilterValues(shop.id, id, parsedValues);
    if (!ok) throw new Response("Not found", { status: 404 });

    await recordActivity({
      shopId: shop.id,
      action: "filter.values_updated",
      summary: "Updated filter value overrides",
      entityType: "filter",
      entityId: id,
    });
    invalidateShop(shop.domain);

    return redirect(`/app/filters/${id}?saved=1`);
  }

  const raw = formToObject(formData);
  if (typeof raw.maxVisibleValues === "string") {
    raw.maxVisibleValues = Number(raw.maxVisibleValues);
  }

  const parsed = parseInput(filterInputSchema, raw);
  if (!parsed.ok) return { errors: parsed.errors, scope: "filter" as const };

  const filter = await updateFilter(shop.id, id, parsed.data);
  if (!filter) throw new Response("Not found", { status: 404 });

  await recordActivity({
    shopId: shop.id,
    action: "filter.updated",
    summary: `Updated filter “${filter.name}”`,
    entityType: "filter",
    entityId: filter.id,
  });
  invalidateShop(shop.domain);

  return redirect(`/app/filters/${id}?saved=1`);
};

export default function EditFilter() {
  const { filter, builder } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  const filterErrors =
    actionData?.scope === "values" ? {} : (actionData?.errors ?? {});
  const valueErrors =
    actionData?.scope === "values" ? (actionData?.errors ?? {}) : {};

  const isSwatch = ["color_swatch", "image_swatch"].includes(filter.displayType);

  return (
    <s-page heading={filter.name}>
      <s-button slot="back-action" href="/app/filters">
        Filters
      </s-button>

      {searchParams.get("created") ? (
        <s-banner tone="success" heading="Filter created">
          <s-paragraph>
            Add the <strong>Product filters</strong> block to your collection
            template in the theme editor to show it on the storefront.
          </s-paragraph>
        </s-banner>
      ) : null}

      {searchParams.get("saved") ? (
        <s-banner tone="success" heading="Saved" />
      ) : null}

      <FilterForm
        values={filter}
        errors={filterErrors}
        groups={builder.groups}
        optionNames={builder.optionNames}
        productMetafields={builder.productMetafields}
        variantMetafields={builder.variantMetafields}
        lockedSources={builder.lockedSources}
        submitLabel="Save filter"
      />

      <s-section heading="Value overrides">
        <s-paragraph>
          Shopify supplies the values and counts. Use this table to rename a value,
          give it a swatch, reorder it, or hide it from shoppers. Values you have
          not overridden are shown exactly as Shopify returns them.
        </s-paragraph>

        {filter.values.length === 0 ? (
          <s-banner tone="info" heading="No overrides yet">
            <s-paragraph>
              Add a row for any value you want to customise. The value must match
              what Shopify returns, for example <code>Black</code>.
            </s-paragraph>
          </s-banner>
        ) : null}

        <Form method="post">
          <input type="hidden" name="intent" value="values" />

          <s-table>
            <s-table-header-row>
              <s-table-header>Value</s-table-header>
              <s-table-header>Display label</s-table-header>
              {isSwatch ? <s-table-header>Swatch colour</s-table-header> : null}
              {isSwatch ? <s-table-header>Swatch image URL</s-table-header> : null}
              <s-table-header>Hidden</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {[...filter.values, null].map((value, index) => (
                <s-table-row key={value?.value ?? `new-${index}`}>
                  <s-table-cell>
                    <s-text-field
                      name="value[]"
                      label="Value"
                      labelAccessibilityVisibility="exclusive"
                      value={value?.value ?? ""}
                      placeholder={value ? undefined : "Add a value…"}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <s-text-field
                      name="label[]"
                      label="Label"
                      labelAccessibilityVisibility="exclusive"
                      value={value?.label ?? ""}
                    />
                  </s-table-cell>
                  {isSwatch ? (
                    <s-table-cell>
                      <s-text-field
                        name="swatchColor[]"
                        label="Swatch colour"
                        labelAccessibilityVisibility="exclusive"
                        value={value?.swatchColor ?? ""}
                        placeholder="#1A1A1A"
                        error={valueErrors.swatchColor}
                      />
                    </s-table-cell>
                  ) : null}
                  {isSwatch ? (
                    <s-table-cell>
                      <s-text-field
                        name="swatchImage[]"
                        label="Swatch image"
                        labelAccessibilityVisibility="exclusive"
                        value={value?.swatchImage ?? ""}
                        placeholder="https://cdn.shopify.com/…"
                        error={valueErrors.swatchImage}
                      />
                    </s-table-cell>
                  ) : null}
                  <s-table-cell>
                    <s-select
                      name="hidden[]"
                      label="Hidden"
                      labelAccessibilityVisibility="exclusive"
                      value={value?.hidden ? "true" : "false"}
                    >
                      <s-option value="false">Visible</s-option>
                      <s-option value="true">Hidden</s-option>
                    </s-select>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>

          {valueErrors._form ? (
            <s-banner tone="critical" heading="Could not save values">
              <s-paragraph>{valueErrors._form}</s-paragraph>
            </s-banner>
          ) : null}

          <s-button type="submit" variant="secondary">
            Save values
          </s-button>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Storefront details">
        <s-stack direction="block" gap="small-300">
          <s-text color="subdued">URL parameter</s-text>
          <s-text>
            <code>{filter.handle}</code>
          </s-text>
          <s-divider />
          <s-text color="subdued">Values with cached counts</s-text>
          <s-text>
            {filter.values.filter((value) => value.cachedCount !== null).length}
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
