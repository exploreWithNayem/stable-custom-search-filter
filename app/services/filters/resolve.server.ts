/**
 * Resolves which filters apply to a storefront context (CLAUDE.md §8.5).
 *
 * Precedence: an enabled CollectionFilter with `useDefault: false` and at least
 * one item wins; anything else falls back to the shop's default set. A
 * collection that has never been configured therefore just works.
 */

import type { Filter, FilterGroup, FilterValue } from "@prisma/client";
import prisma from "../../db.server";
import { toParamKey } from "../../lib/filter-url";
import { FILTER_SOURCE_DEFINITIONS, isFilterSource } from "../../config/filter-types";
import { getCollectionFilterByHandle } from "../../models/collection.server";
import { readFilterConfig, type FilterConfig } from "../../models/filter.server";

export interface ResolvedFilter {
  id: string;
  handle: string;
  name: string;
  /** Canonical query param — identical to Shopify's `Filter.id`. */
  param: string;
  source: string;
  sourceKey: string | null;
  displayType: string;
  multiSelect: boolean;
  showCount: boolean;
  hideEmpty: boolean;
  collapsedByDefault: boolean;
  searchableValues: boolean;
  maxVisibleValues: number;
  valueSort: string;
  config: FilterConfig;
  group: { handle: string; name: string; defaultOpen: boolean; collapsible: boolean } | null;
  /** Merchant overrides keyed by raw storefront value. */
  overrides: Map<string, FilterValue>;
  /** False when Shopify's own filtering cannot express this filter. */
  nativeCompatible: boolean;
}

export interface ResolvedFilterConfig {
  filters: ResolvedFilter[];
  /** True when every resolved filter can run on Engine Native. */
  nativeEligible: boolean;
  source: "collection" | "default";
  collectionHandle: string | null;
  layout: string;
}

type FilterRow = Filter & { group: FilterGroup | null; values: FilterValue[] };

function toResolved(row: FilterRow): ResolvedFilter | null {
  const param = toParamKey(row.source, row.sourceKey);
  // A filter that cannot produce a param key is unusable; drop it rather than
  // emit a facet the storefront could never toggle.
  if (!param) return null;

  const definition = isFilterSource(row.source)
    ? FILTER_SOURCE_DEFINITIONS[row.source]
    : null;

  const overrides = new Map<string, FilterValue>();
  for (const value of row.values) overrides.set(value.value, value);

  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    param,
    source: row.source,
    sourceKey: row.sourceKey,
    displayType: row.displayType,
    multiSelect: row.multiSelect,
    showCount: row.showCount,
    hideEmpty: row.hideEmpty,
    collapsedByDefault: row.collapsedByDefault,
    searchableValues: row.searchableValues,
    maxVisibleValues: row.maxVisibleValues,
    valueSort: row.valueSort,
    config: readFilterConfig(row),
    group: row.group
      ? {
          handle: row.group.handle,
          name: row.group.name,
          defaultOpen: row.group.defaultOpen,
          collapsible: row.group.collapsible,
        }
      : null,
    overrides,
    nativeCompatible: definition ? definition.nativeFilterable !== false : false,
  };
}

async function loadDefaultFilters(shopId: string): Promise<FilterRow[]> {
  return prisma.filter.findMany({
    where: { shopId, enabled: true },
    include: { group: true, values: { orderBy: { position: "asc" } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function resolveFilterConfig(
  shopId: string,
  collectionHandle: string | null,
): Promise<ResolvedFilterConfig> {
  let rows: FilterRow[] = [];
  let source: ResolvedFilterConfig["source"] = "default";
  let layout = "sidebar";

  if (collectionHandle) {
    const collectionConfig = await getCollectionFilterByHandle(
      shopId,
      collectionHandle,
    );

    if (collectionConfig?.enabled && !collectionConfig.useDefault) {
      const orderedIds = collectionConfig.items
        .filter((item) => item.enabled && item.filterId)
        .map((item) => item.filterId as string);

      if (orderedIds.length > 0) {
        const found = await prisma.filter.findMany({
          where: { shopId, enabled: true, id: { in: orderedIds } },
          include: { group: true, values: { orderBy: { position: "asc" } } },
        });

        // Preserve the merchant's explicit ordering, not the database's.
        const byId = new Map(found.map((row) => [row.id, row]));
        rows = orderedIds
          .map((id) => byId.get(id))
          .filter((row): row is FilterRow => row !== undefined);
        source = "collection";
        layout = collectionConfig.layout;
      }
    } else if (collectionConfig?.enabled) {
      layout = collectionConfig.layout;
    }
  }

  if (rows.length === 0) {
    rows = await loadDefaultFilters(shopId);
  }

  const filters = rows
    .map(toResolved)
    .filter((filter): filter is ResolvedFilter => filter !== null);

  return {
    filters,
    nativeEligible: filters.every((filter) => filter.nativeCompatible),
    source,
    collectionHandle,
    layout,
  };
}

/** Maps a Shopify `Filter.id` back to the merchant filter that owns it. */
export function indexByParam(
  config: ResolvedFilterConfig,
): Map<string, ResolvedFilter> {
  return new Map(config.filters.map((filter) => [filter.param, filter]));
}
