/** Filter groups CRUD and ordering (CLAUDE.md §5 of the spec / §8.4, Phase 5). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  countGroups,
  createGroup,
  deleteGroup,
  listGroups,
  reorderGroups,
  updateGroup,
} from "../models/filter.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import { filterGroupInputSchema, formToObject, parseInput } from "../lib/validation";
import { isOverLimit } from "../config/plans";
import { EmptyState } from "../components/admin/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const groups = await listGroups(shop.id);

  return {
    plan: { name: plan.name, limit: plan.limits.filterGroups },
    atLimit: isOverLimit(plan.key, "filterGroups", groups.length),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      handle: group.handle,
      enabled: group.enabled,
      defaultOpen: group.defaultOpen,
      collapsible: group.collapsible,
      filterCount: group.filters.length,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");

  if (intent === "create" || intent === "update") {
    const parsed = parseInput(filterGroupInputSchema, formToObject(formData));
    if (!parsed.ok) return { errors: parsed.errors, intent };

    if (intent === "create") {
      const existing = await countGroups(shop.id);
      if (isOverLimit(plan.key, "filterGroups", existing)) {
        return {
          errors: {
            _form: `The ${plan.name} plan includes ${plan.limits.filterGroups} groups.`,
          },
          intent,
        };
      }

      const group = await createGroup(shop.id, parsed.data);
      await recordActivity({
        shopId: shop.id,
        action: "group.created",
        summary: `Created group “${group.name}”`,
        entityType: "group",
        entityId: group.id,
      });
    } else {
      const group = await updateGroup(shop.id, id, parsed.data);
      if (group) {
        await recordActivity({
          shopId: shop.id,
          action: "group.updated",
          summary: `Updated group “${group.name}”`,
          entityType: "group",
          entityId: group.id,
        });
      }
    }
  } else if (intent === "delete") {
    // Filters in the group survive; the schema sets their groupId to null.
    const ok = await deleteGroup(shop.id, id);
    if (ok) {
      await recordActivity({
        shopId: shop.id,
        action: "group.deleted",
        summary: "Deleted a group",
        entityType: "group",
        entityId: id,
      });
    }
  } else if (intent === "move") {
    const ids = formData.getAll("ids[]").map(String);
    const direction = String(formData.get("direction") ?? "");
    const index = ids.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;

    if (index >= 0 && target >= 0 && target < ids.length) {
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await reorderGroups(shop.id, ids);
    }
  }

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

export default function GroupsIndex() {
  const { groups, plan, atLimit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const ids = groups.map((group) => group.id);
  const errors = actionData?.errors ?? {};

  return (
    <s-page heading="Filter groups">
      <s-section heading="Groups">
        {groups.length === 0 ? (
          <EmptyState
            heading="No groups yet"
            description="Groups turn a flat list of filters into named sections such as “Shop by category” or “Fit”. Filters without a group render at the top level."
          />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Filters</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Default state</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {groups.map((group, index) => (
                <s-table-row key={group.id}>
                  <s-table-cell>
                    <Form method="post">
                      <input type="hidden" name="intent" value="update" />
                      <input type="hidden" name="id" value={group.id} />
                      <s-stack direction="inline" gap="small-400">
                        <s-text-field
                          name="name"
                          label="Name"
                          labelAccessibilityVisibility="exclusive"
                          value={group.name}
                        />
                        <BooleanField name="enabled" label="On" checked={group.enabled} />
                        <BooleanField
                          name="defaultOpen"
                          label="Open"
                          checked={group.defaultOpen}
                        />
                        <BooleanField
                          name="collapsible"
                          label="Collapsible"
                          checked={group.collapsible}
                        />
                        <s-button type="submit" variant="tertiary" disabled={busy || undefined}>
                          Save
                        </s-button>
                      </s-stack>
                    </Form>
                  </s-table-cell>
                  <s-table-cell>{group.filterCount}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={group.enabled ? "success" : "neutral"}>
                      {group.enabled ? "Active" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{group.defaultOpen ? "Open" : "Collapsed"}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-500">
                      <Form method="post">
                        <input type="hidden" name="intent" value="move" />
                        <input type="hidden" name="id" value={group.id} />
                        <input type="hidden" name="direction" value="up" />
                        {ids.map((value) => (
                          <input key={value} type="hidden" name="ids[]" value={value} />
                        ))}
                        <s-button
                          type="submit"
                          variant="tertiary"
                          accessibilityLabel={`Move ${group.name} up`}
                          disabled={index === 0 || undefined}
                        >
                          ↑
                        </s-button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="move" />
                        <input type="hidden" name="id" value={group.id} />
                        <input type="hidden" name="direction" value="down" />
                        {ids.map((value) => (
                          <input key={value} type="hidden" name="ids[]" value={value} />
                        ))}
                        <s-button
                          type="submit"
                          variant="tertiary"
                          accessibilityLabel={`Move ${group.name} down`}
                          disabled={index === groups.length - 1 || undefined}
                        >
                          ↓
                        </s-button>
                      </Form>
                      <Form
                        method="post"
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `Delete “${group.name}”? Its filters will become ungrouped.`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={group.id} />
                        <s-button type="submit" variant="tertiary" tone="critical">
                          Delete
                        </s-button>
                      </Form>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Add a group">
        {atLimit ? (
          <s-banner tone="warning" heading="Group limit reached">
            <s-paragraph>
              The {plan.name} plan includes {plan.limit} groups.
            </s-paragraph>
            <s-button href="/app/pricing">View plans</s-button>
          </s-banner>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <s-stack direction="block" gap="base">
              <s-text-field
                name="name"
                label="Group name"
                placeholder="Shop by category"
                error={errors.name}
                required
              />
              <BooleanField name="enabled" label="Enabled" checked />
              <BooleanField name="defaultOpen" label="Open by default" checked />
              <BooleanField name="collapsible" label="Collapsible" checked />
              {errors._form ? (
                <s-banner tone="critical" heading="Could not create group">
                  <s-paragraph>{errors._form}</s-paragraph>
                </s-banner>
              ) : null}
              <s-button type="submit" variant="primary">
                Add group
              </s-button>
            </s-stack>
          </Form>
        )}
      </s-section>
    </s-page>
  );
}
