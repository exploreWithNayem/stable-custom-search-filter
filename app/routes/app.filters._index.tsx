/**
 * The default filter tree — the ordered set of filter options the storefront
 * renders (CLAUDE.md §13.2, Phase 5).
 *
 * A collection can override this list with its own; unconfigured collections
 * and the search page fall back to what is here (§8.5).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  createFilter,
  deleteFilter,
  duplicateFilter,
  listFilters,
  reorderFilters,
  setFilterEnabled,
} from "../models/filter.server";
import { listProductOptionNames } from "../services/admin/metafields.server";
import { resolvePresets } from "../config/presets";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  FILTER_DISPLAY_LABELS,
  FILTER_SOURCE_DEFINITIONS,
  isFilterDisplayType,
  isFilterSource,
} from "../config/filter-types";
import { AutoSubmitForm, EmptyState } from "../components/admin/ui";
import { isOverLimit } from "../config/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const filters = await listFilters(shop.id);

  return {
    plan: { key: plan.key, name: plan.name, limit: plan.limits.filters },
    atLimit: isOverLimit(plan.key, "filters", filters.length),
    filters: filters.map((filter) => ({
      id: filter.id,
      name: filter.name,
      handle: filter.handle,
      source: filter.source,
      sourceKey: filter.sourceKey,
      displayType: filter.displayType,
      enabled: filter.enabled,
      groupName: filter.group?.name ?? null,
      // A filter with no curated values shows every value the catalogue has.
      valueCount: filter.values.filter((value) => !value.hidden).length,
      hiddenCount: filter.values.filter((value) => value.hidden).length,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");

  switch (intent) {
    case "presets": {
      // The option names cost an Admin API call, so they are fetched here
      // rather than in the loader — the list itself does not need them.
      const existing = await listFilters(shop.id);
      const optionNames = await listProductOptionNames(admin);
      const resolved = resolvePresets(
        optionNames,
        existing.map((filter) => ({
          source: filter.source,
          sourceKey: filter.sourceKey,
        })),
      );

      let created = 0;
      for (const { preset, sourceKey } of resolved) {
        if (isOverLimit(plan.key, "filters", existing.length + created)) break;

        await createFilter(shop.id, {
          name: preset.name,
          source: preset.source,
          sourceKey,
          displayType: preset.displayType,
          enabled: true,
          multiSelect: preset.multiSelect ?? true,
          showCount: true,
          hideEmpty: true,
          collapsedByDefault: preset.collapsedByDefault ?? false,
          searchableValues: preset.searchableValues ?? false,
          maxVisibleValues: preset.maxVisibleValues ?? 8,
          valueSort: "count",
          config: {},
        });
        created += 1;
      }

      await recordActivity({
        shopId: shop.id,
        action: "filter.presets_added",
        summary: `Added ${created} starter filter${created === 1 ? "" : "s"}`,
      });
      break;
    }

    case "toggle": {
      // The switch posts its value only when on, so absence means "off".
      const enabled = formData.get("enabled") === "true";
      const ok = await setFilterEnabled(shop.id, id, enabled);
      if (ok) {
        await recordActivity({
          shopId: shop.id,
          action: enabled ? "filter.enabled" : "filter.disabled",
          summary: `Filter ${enabled ? "enabled" : "disabled"}`,
          entityType: "filter",
          entityId: id,
        });
      }
      break;
    }

    case "duplicate": {
      const copy = await duplicateFilter(shop.id, id);
      if (copy) {
        await recordActivity({
          shopId: shop.id,
          action: "filter.duplicated",
          summary: `Duplicated filter “${copy.name}”`,
          entityType: "filter",
          entityId: copy.id,
        });
      }
      break;
    }

    case "delete": {
      const ok = await deleteFilter(shop.id, id);
      if (ok) {
        await recordActivity({
          shopId: shop.id,
          action: "filter.deleted",
          summary: "Deleted a filter",
          entityType: "filter",
          entityId: id,
        });
      }
      break;
    }

    case "move": {
      // Reordering submits the full id list so positions stay contiguous.
      const ids = formData.getAll("ids[]").map(String);
      const direction = String(formData.get("direction") ?? "");
      const index = ids.indexOf(id);
      const target = direction === "up" ? index - 1 : index + 1;

      if (index >= 0 && target >= 0 && target < ids.length) {
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await reorderFilters(shop.id, ids);
      }
      break;
    }
  }

  invalidateShop(shop.domain);
  return { ok: true };
};

function AddFilterOption({ disabled }: { disabled: boolean }) {
  return (
    <s-button
      href="/app/filters/new"
      variant="tertiary"
      disabled={disabled || undefined}
    >
      + Add filter option
    </s-button>
  );
}

export default function FilterTree() {
  const { filters, plan, atLimit } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const ids = filters.map((filter) => filter.id);

  return (
    <s-page heading="Default filter tree">
      <s-button
        slot="primary-action"
        href="/app/filters/new"
        disabled={atLimit || undefined}
      >
        Add filter option
      </s-button>
      <s-button
        slot="secondary-actions"
        href="/app/filters/layout"
        variant="secondary"
      >
        Layout
      </s-button>

      {atLimit ? (
        <s-banner
          tone="warning"
          heading={`${plan.name} plan filter limit reached`}
        >
          <s-paragraph>
            You are using all {plan.limit} filters included in the {plan.name}{" "}
            plan. Upgrade to add more, or disable one you are not using.
          </s-paragraph>
          <s-button href="/app/pricing">View plans</s-button>
        </s-banner>
      ) : null}

      <s-section heading="Filter tree information">
        <s-paragraph>
          This tree is shown on collection and search pages that do not have
          their own. Turning an option off hides it from the storefront without
          deleting its configuration.
        </s-paragraph>
      </s-section>

      <s-section heading="Filter options">
        {filters.length === 0 ? (
          <EmptyState
            heading="No filter options yet"
            description="Until you add some, your storefront falls back to Shopify's own filters. Start with the set most catalogues need — availability, price, brand, product type, and colour and size where your products have them — then adjust from there."
            action={
              <s-stack direction="inline" gap="base">
                <Form method="post">
                  <input type="hidden" name="intent" value="presets" />
                  <s-button type="submit" variant="primary" disabled={busy || undefined}>
                    Add the starter set
                  </s-button>
                </Form>
                <s-button href="/app/filters/new" variant="secondary">
                  Add one myself
                </s-button>
              </s-stack>
            }
          />
        ) : (
          <>
            <s-stack direction="inline" justifyContent="end">
              <AddFilterOption disabled={atLimit} />
            </s-stack>

            <s-table>
              <s-table-header-row>
                <s-table-header>Status</s-table-header>
                <s-table-header listSlot="primary">Label</s-table-header>
                <s-table-header>Type</s-table-header>
                <s-table-header>Display type</s-table-header>
                <s-table-header>Value</s-table-header>
                <s-table-header>Order</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filters.map((filter, index) => {
                  const sourceLabel = isFilterSource(filter.source)
                    ? FILTER_SOURCE_DEFINITIONS[filter.source].label
                    : filter.source;
                  const displayLabel = isFilterDisplayType(filter.displayType)
                    ? FILTER_DISPLAY_LABELS[filter.displayType]
                    : filter.displayType;

                  return (
                    <s-table-row key={filter.id}>
                      <s-table-cell>
                        <AutoSubmitForm>
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={filter.id} />
                          <s-switch
                            name="enabled"
                            value="true"
                            label={filter.enabled ? "Enabled" : "Disabled"}
                            labelAccessibilityVisibility="exclusive"
                            checked={filter.enabled || undefined}
                          />
                        </AutoSubmitForm>
                      </s-table-cell>

                      <s-table-cell>
                        <s-link href={`/app/filters/${filter.id}`}>
                          {filter.name}
                        </s-link>
                        {filter.groupName ? (
                          <s-text color="subdued"> · {filter.groupName}</s-text>
                        ) : null}
                      </s-table-cell>

                      <s-table-cell>
                        {filter.sourceKey
                          ? `${sourceLabel}: ${filter.sourceKey}`
                          : sourceLabel}
                      </s-table-cell>

                      <s-table-cell>{displayLabel}</s-table-cell>

                      <s-table-cell>
                        {filter.valueCount === 0 && filter.hiddenCount === 0
                          ? "All values"
                          : `${filter.valueCount} customised${
                              filter.hiddenCount > 0
                                ? `, ${filter.hiddenCount} hidden`
                                : ""
                            }`}
                      </s-table-cell>

                      <s-table-cell>
                        <s-stack direction="inline" gap="small-500">
                          <Form method="post">
                            <input type="hidden" name="intent" value="move" />
                            <input type="hidden" name="id" value={filter.id} />
                            <input type="hidden" name="direction" value="up" />
                            {ids.map((value) => (
                              <input
                                key={value}
                                type="hidden"
                                name="ids[]"
                                value={value}
                              />
                            ))}
                            <s-button
                              type="submit"
                              variant="tertiary"
                              accessibilityLabel={`Move ${filter.name} up`}
                              disabled={index === 0 || busy || undefined}
                            >
                              ↑
                            </s-button>
                          </Form>

                          <Form method="post">
                            <input type="hidden" name="intent" value="move" />
                            <input type="hidden" name="id" value={filter.id} />
                            <input
                              type="hidden"
                              name="direction"
                              value="down"
                            />
                            {ids.map((value) => (
                              <input
                                key={value}
                                type="hidden"
                                name="ids[]"
                                value={value}
                              />
                            ))}
                            <s-button
                              type="submit"
                              variant="tertiary"
                              accessibilityLabel={`Move ${filter.name} down`}
                              disabled={
                                index === filters.length - 1 ||
                                busy ||
                                undefined
                              }
                            >
                              ↓
                            </s-button>
                          </Form>
                        </s-stack>
                      </s-table-cell>

                      <s-table-cell>
                        <s-stack direction="inline" gap="small-400">
                          <s-button
                            href={`/app/filters/${filter.id}`}
                            variant="tertiary"
                            accessibilityLabel={`Edit ${filter.name}`}
                          >
                            Edit
                          </s-button>

                          <Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value="duplicate"
                            />
                            <input type="hidden" name="id" value={filter.id} />
                            <s-button
                              type="submit"
                              variant="tertiary"
                              disabled={busy || undefined}
                            >
                              Duplicate
                            </s-button>
                          </Form>

                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (!window.confirm(`Delete “${filter.name}”?`)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="id" value={filter.id} />
                            <s-button
                              type="submit"
                              variant="tertiary"
                              tone="critical"
                            >
                              Delete
                            </s-button>
                          </Form>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>

            <s-stack direction="inline" justifyContent="end">
              <AddFilterOption disabled={atLimit} />
            </s-stack>
          </>
        )}
      </s-section>

      {filters.length > 0 && !atLimit ? (
        <s-section slot="aside" heading="Starter set">
          <s-paragraph>
            Add any of the common options you are still missing — availability,
            price, brand, product type, and colour and size where your products
            have them. Options you already have are skipped.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="presets" />
            <s-button type="submit" variant="secondary" disabled={busy || undefined}>
              Add missing starters
            </s-button>
          </Form>
        </s-section>
      ) : null}

      <s-section slot="aside" heading="Ordering">
        <s-paragraph>
          Options appear on the storefront in this order. Group related options
          into named sections, or give a collection its own tree.
        </s-paragraph>
        <s-stack direction="block" gap="small-300">
          <s-button href="/app/groups" variant="secondary">
            Manage groups
          </s-button>
          <s-button href="/app/collections" variant="secondary">
            Collection filter trees
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}
