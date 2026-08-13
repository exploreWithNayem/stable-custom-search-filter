/** Filter list and row actions (CLAUDE.md §34, Phase 5). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  deleteFilter,
  duplicateFilter,
  listFilters,
  reorderFilters,
  setFilterEnabled,
} from "../models/filter.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  FILTER_DISPLAY_LABELS,
  FILTER_SOURCE_DEFINITIONS,
  isFilterDisplayType,
  isFilterSource,
} from "../config/filter-types";
import { EmptyState } from "../components/admin/ui";
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
      valueCount: filter.values.length,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");

  switch (intent) {
    case "toggle": {
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

export default function FiltersIndex() {
  const { filters, plan, atLimit } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const ids = filters.map((filter) => filter.id);

  return (
    <s-page heading="Filters">
      <s-button
        slot="primary-action"
        href="/app/filters/new"
        disabled={atLimit || undefined}
      >
        Create filter
      </s-button>

      {atLimit ? (
        <s-banner tone="warning" heading={`${plan.name} plan filter limit reached`}>
          <s-paragraph>
            You are using all {plan.limit} filters included in the {plan.name} plan.
            Upgrade to add more, or disable one you are not using.
          </s-paragraph>
          <s-button href="/app/pricing">View plans</s-button>
        </s-banner>
      ) : null}

      <s-section>
        {filters.length === 0 ? (
          <EmptyState
            heading="No filters yet"
            description="Create filters for the things shoppers care about — colour, size, price, availability — then add the Product filters block to your collection template."
            action={<s-button href="/app/filters/new">Create your first filter</s-button>}
          />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Source</s-table-header>
              <s-table-header>Group</s-table-header>
              <s-table-header>Status</s-table-header>
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
                      <s-link href={`/app/filters/${filter.id}`}>{filter.name}</s-link>
                    </s-table-cell>
                    <s-table-cell>{displayLabel}</s-table-cell>
                    <s-table-cell>
                      {sourceLabel}
                      {filter.sourceKey ? ` · ${filter.sourceKey}` : ""}
                    </s-table-cell>
                    <s-table-cell>{filter.groupName ?? "—"}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone={filter.enabled ? "success" : "neutral"}>
                        {filter.enabled ? "Active" : "Disabled"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-400">
                        <Form method="post">
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={filter.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={filter.enabled ? "false" : "true"}
                          />
                          <s-button type="submit" variant="tertiary" disabled={busy || undefined}>
                            {filter.enabled ? "Disable" : "Enable"}
                          </s-button>
                        </Form>

                        <Form method="post">
                          <input type="hidden" name="intent" value="duplicate" />
                          <input type="hidden" name="id" value={filter.id} />
                          <s-button type="submit" variant="tertiary" disabled={busy || undefined}>
                            Duplicate
                          </s-button>
                        </Form>

                        <Form method="post">
                          <input type="hidden" name="intent" value="move" />
                          <input type="hidden" name="id" value={filter.id} />
                          <input type="hidden" name="direction" value="up" />
                          {ids.map((value) => (
                            <input key={value} type="hidden" name="ids[]" value={value} />
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
                          <input type="hidden" name="direction" value="down" />
                          {ids.map((value) => (
                            <input key={value} type="hidden" name="ids[]" value={value} />
                          ))}
                          <s-button
                            type="submit"
                            variant="tertiary"
                            accessibilityLabel={`Move ${filter.name} down`}
                            disabled={index === filters.length - 1 || busy || undefined}
                          >
                            ↓
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
                          <s-button type="submit" variant="tertiary" tone="critical">
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
        )}
      </s-section>

      <s-section slot="aside" heading="Ordering">
        <s-paragraph>
          Filters appear on the storefront in this order. Use the arrows to move
          them, or assign them to groups for named sections.
        </s-paragraph>
        <s-button href="/app/groups" variant="secondary">
          Manage groups
        </s-button>
      </s-section>
    </s-page>
  );
}
