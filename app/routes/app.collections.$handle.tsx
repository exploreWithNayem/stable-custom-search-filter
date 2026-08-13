/** Per-collection filter configuration (CLAUDE.md §22, §8.5, Phase 6). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { listCollections } from "../services/admin/collections.server";
import {
  countConfiguredCollections,
  getCollectionFilterByHandle,
  upsertCollectionFilter,
} from "../models/collection.server";
import { listFilters } from "../models/filter.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import { collectionFilterInputSchema, parseInput } from "../lib/validation";
import { DESKTOP_LAYOUT_DEFINITIONS } from "../config/layouts";
import { isOverLimit, planAllows } from "../config/plans";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const handle = params.handle ?? "";

  // Resolve the collection through the Admin API so we always have a real GID.
  const page = await listCollections(admin, { first: 1, query: `handle:${handle}` });
  const collection = page.collections.find(
    (candidate) => candidate.handle === handle,
  );
  if (!collection) throw new Response("Not found", { status: 404 });

  const [config, filters] = await Promise.all([
    getCollectionFilterByHandle(shop.id, handle),
    listFilters(shop.id),
  ]);

  const selectedIds = new Set(
    config?.items
      .filter((item) => item.filterId)
      .map((item) => item.filterId as string) ?? [],
  );

  // Selected filters first, in the merchant's order, then the rest.
  const ordered = [
    ...(config?.items
      .map((item) => filters.find((filter) => filter.id === item.filterId))
      .filter((filter): filter is (typeof filters)[number] => Boolean(filter)) ?? []),
    ...filters.filter((filter) => !selectedIds.has(filter.id)),
  ];

  return {
    allowed: planAllows(plan.key, "collectionFilters"),
    planName: plan.name,
    collection,
    config: {
      useDefault: config?.useDefault ?? true,
      enabled: config?.enabled ?? true,
      layout: config?.layout ?? "sidebar",
      title: config?.title ?? "",
    },
    filters: ordered.map((filter) => ({
      id: filter.id,
      name: filter.name,
      displayType: filter.displayType,
      enabled: filter.enabled,
      selected: selectedIds.has(filter.id),
    })),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const handle = params.handle ?? "";

  if (!planAllows(plan.key, "collectionFilters")) {
    return {
      errors: {
        _form: "Collection-specific filters require the Standard plan or higher.",
      },
    };
  }

  const page = await listCollections(admin, { first: 1, query: `handle:${handle}` });
  const collection = page.collections.find(
    (candidate) => candidate.handle === handle,
  );
  if (!collection) throw new Response("Not found", { status: 404 });

  const formData = await request.formData();
  const useDefault = formData.get("useDefault") === "true";

  // Only enforce the limit when switching a collection ONTO a custom set.
  if (!useDefault) {
    const existing = await getCollectionFilterByHandle(shop.id, handle);
    if (existing?.useDefault !== false) {
      const configured = await countConfiguredCollections(shop.id);
      if (isOverLimit(plan.key, "configuredCollections", configured)) {
        return {
          errors: {
            _form: `The ${plan.name} plan includes ${plan.limits.configuredCollections} custom collection configurations.`,
          },
        };
      }
    }
  }

  const parsed = parseInput(collectionFilterInputSchema, {
    collectionGid: collection.id,
    collectionHandle: handle,
    title: String(formData.get("title") ?? "") || null,
    enabled: formData.get("enabled") === "true",
    useDefault,
    layout: String(formData.get("layout") ?? "sidebar"),
    // The order of the submitted ids IS the storefront order.
    filterIds: formData.getAll("filterIds[]").map(String),
    settings: {},
  });

  if (!parsed.ok) return { errors: parsed.errors };

  await upsertCollectionFilter(shop.id, parsed.data);
  await recordActivity({
    shopId: shop.id,
    action: "collection.updated",
    summary: `Updated filters for “${collection.title}”`,
    entityType: "collectionFilter",
    entityId: collection.id,
  });
  invalidateShop(shop.domain);

  return redirect(`/app/collections/${handle}?saved=1`);
};

export default function CollectionConfig() {
  const { collection, config, filters, allowed, planName } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const errors = actionData?.errors ?? {};

  return (
    <s-page heading={collection.title}>
      <s-button slot="back-action" href="/app/collections">
        Collections
      </s-button>

      {searchParams.get("saved") ? (
        <s-banner tone="success" heading="Saved" />
      ) : null}

      {!allowed ? (
        <s-banner tone="warning" heading={`Not available on the ${planName} plan`}>
          <s-paragraph>
            Upgrade to give this collection its own filters. It currently uses your
            default filter set.
          </s-paragraph>
          <s-button href="/app/pricing">View plans</s-button>
        </s-banner>
      ) : null}

      <Form method="post">
        <s-section heading="Filter set">
          <s-stack direction="block" gap="base">
            <s-select name="useDefault" label="Filters" value={config.useDefault ? "true" : "false"}>
              <s-option value="true">Use my default filter set</s-option>
              <s-option value="false">Use a custom set for this collection</s-option>
            </s-select>

            <input type="hidden" name="enabled" value="false" />
            <s-checkbox
              name="enabled"
              value="true"
              label="Show filters on this collection"
              checked={config.enabled || undefined}
            />

            <s-select name="layout" label="Layout" value={config.layout}>
              {DESKTOP_LAYOUT_DEFINITIONS.map((definition) => (
                <s-option key={definition.value} value={definition.value}>
                  {definition.label}
                </s-option>
              ))}
            </s-select>

            <s-text-field
              name="title"
              label="Filter heading override"
              details="Leave empty to use the heading from your theme block settings."
              value={config.title}
            />
          </s-stack>
        </s-section>

        <s-section heading="Filters for this collection">
          <s-paragraph>
            Tick the filters this collection should show. The order below is the
            order shoppers see — it only applies when using a custom set.
          </s-paragraph>

          {filters.length === 0 ? (
            <s-banner tone="info" heading="No filters yet">
              <s-paragraph>Create a filter first, then assign it here.</s-paragraph>
              <s-button href="/app/filters/new">Create filter</s-button>
            </s-banner>
          ) : (
            <s-stack direction="block" gap="small-300">
              {filters.map((filter) => (
                <s-stack key={filter.id} direction="inline" gap="base">
                  <s-checkbox
                    name="filterIds[]"
                    value={filter.id}
                    label={filter.name}
                    details={
                      filter.enabled
                        ? filter.displayType
                        : `${filter.displayType} · disabled globally`
                    }
                    checked={filter.selected || undefined}
                  />
                </s-stack>
              ))}
            </s-stack>
          )}

          {errors._form ? (
            <s-banner tone="critical" heading="Could not save">
              <s-paragraph>{errors._form}</s-paragraph>
            </s-banner>
          ) : null}

          <s-button type="submit" variant="primary" disabled={!allowed || undefined}>
            Save configuration
          </s-button>
        </s-section>
      </Form>

      <s-section slot="aside" heading="Collection">
        <s-stack direction="block" gap="small-300">
          <s-text color="subdued">Handle</s-text>
          <s-text>
            <code>{collection.handle}</code>
          </s-text>
          <s-divider />
          <s-text color="subdued">Products</s-text>
          <s-text>{collection.productsCount.toLocaleString()}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
