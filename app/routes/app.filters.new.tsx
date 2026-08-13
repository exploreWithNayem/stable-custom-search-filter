/** Create a filter (CLAUDE.md §35, Phase 5). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { loadBuilderData } from "../services/filters/builder.server";
import { countFilters, createFilter } from "../models/filter.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import { filterInputSchema, formToObject, parseInput } from "../lib/validation";
import { isOverLimit, planAllows } from "../config/plans";
import { FilterForm } from "../components/admin/FilterForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const builder = await loadBuilderData(admin, shop.id, plan);

  return { builder };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();
  const raw = formToObject(formData);

  // Coerce the numeric field before validation — FormData is all strings.
  if (typeof raw.maxVisibleValues === "string") {
    raw.maxVisibleValues = Number(raw.maxVisibleValues);
  }

  const parsed = parseInput(filterInputSchema, raw);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await countFilters(shop.id);
  if (isOverLimit(plan.key, "filters", existing)) {
    return {
      errors: {
        _form: `The ${plan.name} plan includes ${plan.limits.filters} filters. Upgrade to add more.`,
      },
    };
  }

  const metafieldSources = ["product_metafield", "variant_metafield", "rating"];
  if (
    metafieldSources.includes(parsed.data.source) &&
    !planAllows(plan.key, "metafieldFilters")
  ) {
    return {
      errors: { source: "Metafield filters require the Standard plan or higher." },
    };
  }

  const filter = await createFilter(shop.id, parsed.data);

  await recordActivity({
    shopId: shop.id,
    action: "filter.created",
    summary: `Created filter “${filter.name}”`,
    entityType: "filter",
    entityId: filter.id,
  });
  invalidateShop(shop.domain);

  return redirect(`/app/filters/${filter.id}?created=1`);
};

export default function NewFilter() {
  const { builder } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Create filter">
      <s-button slot="back-action" href="/app/filters">
        Filters
      </s-button>

      <FilterForm
        values={{
          name: "",
          source: "product_option",
          sourceKey: null,
          displayType: "checkbox",
          groupId: null,
          enabled: true,
          multiSelect: true,
          showCount: true,
          hideEmpty: true,
          collapsedByDefault: false,
          searchableValues: false,
          maxVisibleValues: 8,
          valueSort: "count",
        }}
        errors={actionData?.errors ?? {}}
        groups={builder.groups}
        optionNames={builder.optionNames}
        productMetafields={builder.productMetafields}
        variantMetafields={builder.variantMetafields}
        lockedSources={builder.lockedSources}
        submitLabel="Create filter"
      />
    </s-page>
  );
}
