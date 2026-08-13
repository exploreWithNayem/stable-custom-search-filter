/**
 * Shared loader data for the filter builder routes (CLAUDE.md §35).
 *
 * Both `filters.new` and `filters.$id` need the same source pickers, so the
 * gathering lives here rather than being duplicated per route.
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../../db.server";
import { listGroups } from "../../models/filter.server";
import {
  listMetafieldDefinitions,
  listProductOptionNames,
  type MetafieldDefinition,
} from "../admin/metafields.server";
import { planAllows, type PlanDefinition, type PlanKey } from "../../config/plans";
import type { FilterSource } from "../../config/filter-types";
import type { SourceKeyOption } from "../../components/admin/FilterForm";

const UNVERIFIED_NOTE =
  "This metafield has not been seen in a storefront filter response yet. Make sure it is enabled as a filter in Shopify's Search & Discovery app, or the filter will render with no values.";

function toOptions(definitions: MetafieldDefinition[]): SourceKeyOption[] {
  return definitions
    .filter((definition) => definition.supported)
    .map((definition) => ({
      value: definition.sourceKey,
      label: `${definition.name} (${definition.sourceKey}) · ${definition.type}`,
      caution:
        definition.storefrontFilterable === "unknown" ? UNVERIFIED_NOTE : null,
    }));
}

export interface BuilderData {
  groups: { id: string; name: string }[];
  optionNames: string[];
  productMetafields: SourceKeyOption[];
  variantMetafields: SourceKeyOption[];
  lockedSources: Partial<Record<FilterSource, string>>;
}

export async function loadBuilderData(
  admin: AdminApiContext,
  shopId: string,
  plan: PlanDefinition,
): Promise<BuilderData> {
  const metafieldsAllowed = planAllows(plan.key as PlanKey, "metafieldFilters");

  // Metafield definitions cost two Admin API calls; skip them entirely when the
  // plan cannot use them anyway.
  const [groups, optionNames, productDefs, variantDefs] = await Promise.all([
    listGroups(shopId),
    listProductOptionNames(admin),
    metafieldsAllowed
      ? listMetafieldDefinitions(admin, "PRODUCT", await verifiedKeys(shopId))
      : Promise.resolve([]),
    metafieldsAllowed
      ? listMetafieldDefinitions(admin, "PRODUCTVARIANT", await verifiedKeys(shopId))
      : Promise.resolve([]),
  ]);

  const lockedSources: Partial<Record<FilterSource, string>> = {};
  if (!metafieldsAllowed) {
    const note = `requires the Standard plan`;
    lockedSources.product_metafield = note;
    lockedSources.variant_metafield = note;
    lockedSources.rating = note;
  }

  return {
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
    optionNames,
    productMetafields: toOptions(productDefs),
    variantMetafields: toOptions(variantDefs),
    lockedSources,
  };
}

/**
 * Metafield keys already in use by a saved filter that has recorded values —
 * evidence that Shopify does return facets for it.
 */
async function verifiedKeys(shopId: string): Promise<Set<string>> {
  const rows = await prisma.filter.findMany({
    where: {
      shopId,
      source: { in: ["product_metafield", "variant_metafield", "rating"] },
      values: { some: {} },
    },
    select: { sourceKey: true },
  });

  return new Set(
    rows
      .map((row) => row.sourceKey)
      .filter((key): key is string => Boolean(key)),
  );
}
