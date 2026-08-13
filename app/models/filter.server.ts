/**
 * Filter and filter-group persistence.
 *
 * SHOP ISOLATION: every exported function takes `shopId` as its first argument
 * and every query filters on it, including updates and deletes addressed by id.
 * A filter id from shop A must never resolve against shop B (CLAUDE.md §5.3).
 */

import type { Filter, FilterGroup, FilterValue } from "@prisma/client";
import prisma from "../db.server";
import { parseJsonObject, stringifyJson } from "../lib/json";
import { toHandle } from "../lib/validation";
import type {
  FilterGroupInput,
  FilterInput,
  FilterValueInput,
} from "../lib/validation";

export type FilterWithValues = Filter & { values: FilterValue[] };
export type FilterWithGroup = Filter & {
  group: FilterGroup | null;
  values: FilterValue[];
};
export type GroupWithFilters = FilterGroup & { filters: Filter[] };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listFilters(
  shopId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<FilterWithGroup[]> {
  return prisma.filter.findMany({
    where: { shopId, ...(options.enabledOnly ? { enabled: true } : {}) },
    include: { group: true, values: { orderBy: { position: "asc" } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getFilter(
  shopId: string,
  id: string,
): Promise<FilterWithValues | null> {
  return prisma.filter.findFirst({
    where: { id, shopId },
    include: { values: { orderBy: { position: "asc" } } },
  });
}

export async function countFilters(
  shopId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<number> {
  return prisma.filter.count({
    where: { shopId, ...(options.enabledOnly ? { enabled: true } : {}) },
  });
}

export async function listGroups(
  shopId: string,
): Promise<GroupWithFilters[]> {
  return prisma.filterGroup.findMany({
    where: { shopId },
    include: { filters: { orderBy: { position: "asc" } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getGroup(
  shopId: string,
  id: string,
): Promise<GroupWithFilters | null> {
  return prisma.filterGroup.findFirst({
    where: { id, shopId },
    include: { filters: { orderBy: { position: "asc" } } },
  });
}

export async function countGroups(shopId: string): Promise<number> {
  return prisma.filterGroup.count({ where: { shopId } });
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * Produces a handle unique within the shop. `excludeId` lets an update keep its
 * own handle without colliding with itself.
 */
async function uniqueFilterHandle(
  shopId: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = toHandle(desired) || "filter";
  let candidate = base;
  let suffix = 2;

  // Bounded: 50 collisions on the same base is pathological, and the loop must
  // terminate rather than spin on a unique-constraint retry.
  while (suffix < 50) {
    const existing = await prisma.filter.findFirst({
      where: { shopId, handle: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return `${base}-${Date.now()}`;
}

async function uniqueGroupHandle(
  shopId: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = toHandle(desired) || "group";
  let candidate = base;
  let suffix = 2;

  while (suffix < 50) {
    const existing = await prisma.filterGroup.findFirst({
      where: { shopId, handle: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return `${base}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Filter writes
// ---------------------------------------------------------------------------

async function nextFilterPosition(shopId: string): Promise<number> {
  const last = await prisma.filter.findFirst({
    where: { shopId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function createFilter(
  shopId: string,
  input: FilterInput,
): Promise<Filter> {
  const handle = await uniqueFilterHandle(shopId, input.handle ?? input.name);
  const groupId = await resolveGroupId(shopId, input.groupId ?? null);

  return prisma.filter.create({
    data: {
      shopId,
      groupId,
      name: input.name,
      handle,
      source: input.source,
      sourceKey: input.sourceKey ?? null,
      displayType: input.displayType,
      position: await nextFilterPosition(shopId),
      enabled: input.enabled,
      multiSelect: input.multiSelect,
      showCount: input.showCount,
      hideEmpty: input.hideEmpty,
      collapsedByDefault: input.collapsedByDefault,
      searchableValues: input.searchableValues,
      maxVisibleValues: input.maxVisibleValues,
      valueSort: input.valueSort,
      config: stringifyJson(input.config),
    },
  });
}

export async function updateFilter(
  shopId: string,
  id: string,
  input: FilterInput,
): Promise<Filter | null> {
  const existing = await prisma.filter.findFirst({
    where: { id, shopId },
    select: { id: true, handle: true },
  });
  if (!existing) return null;

  const handle =
    input.handle && input.handle !== existing.handle
      ? await uniqueFilterHandle(shopId, input.handle, id)
      : existing.handle;
  const groupId = await resolveGroupId(shopId, input.groupId ?? null);

  return prisma.filter.update({
    where: { id },
    data: {
      groupId,
      name: input.name,
      handle,
      source: input.source,
      sourceKey: input.sourceKey ?? null,
      displayType: input.displayType,
      enabled: input.enabled,
      multiSelect: input.multiSelect,
      showCount: input.showCount,
      hideEmpty: input.hideEmpty,
      collapsedByDefault: input.collapsedByDefault,
      searchableValues: input.searchableValues,
      maxVisibleValues: input.maxVisibleValues,
      valueSort: input.valueSort,
      config: stringifyJson(input.config),
    },
  });
}

/** Confirms a group id belongs to this shop before it is written to a filter. */
async function resolveGroupId(
  shopId: string,
  groupId: string | null,
): Promise<string | null> {
  if (!groupId) return null;
  const group = await prisma.filterGroup.findFirst({
    where: { id: groupId, shopId },
    select: { id: true },
  });
  return group?.id ?? null;
}

export async function deleteFilter(
  shopId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.filter.deleteMany({ where: { id, shopId } });
  return result.count > 0;
}

export async function setFilterEnabled(
  shopId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await prisma.filter.updateMany({
    where: { id, shopId },
    data: { enabled },
  });
  return result.count > 0;
}

export async function duplicateFilter(
  shopId: string,
  id: string,
): Promise<Filter | null> {
  const source = await getFilter(shopId, id);
  if (!source) return null;

  const handle = await uniqueFilterHandle(shopId, `${source.handle}-copy`);

  return prisma.filter.create({
    data: {
      shopId,
      groupId: source.groupId,
      name: `${source.name} (copy)`,
      handle,
      source: source.source,
      sourceKey: source.sourceKey,
      displayType: source.displayType,
      position: await nextFilterPosition(shopId),
      enabled: false, // copies start disabled so they can be edited first
      multiSelect: source.multiSelect,
      showCount: source.showCount,
      hideEmpty: source.hideEmpty,
      collapsedByDefault: source.collapsedByDefault,
      searchableValues: source.searchableValues,
      maxVisibleValues: source.maxVisibleValues,
      valueSort: source.valueSort,
      config: source.config,
      values: {
        create: source.values.map((value) => ({
          value: value.value,
          label: value.label,
          swatchColor: value.swatchColor,
          swatchImage: value.swatchImage,
          position: value.position,
          hidden: value.hidden,
        })),
      },
    },
  });
}

/** Applies a new order. Ids not belonging to the shop are ignored. */
export async function reorderFilters(
  shopId: string,
  ids: string[],
): Promise<void> {
  const owned = await prisma.filter.findMany({
    where: { shopId, id: { in: ids } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));

  await prisma.$transaction(
    ids
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.filter.update({ where: { id }, data: { position: index } }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Filter values
// ---------------------------------------------------------------------------

export async function replaceFilterValues(
  shopId: string,
  filterId: string,
  values: FilterValueInput[],
): Promise<boolean> {
  const filter = await prisma.filter.findFirst({
    where: { id: filterId, shopId },
    select: { id: true },
  });
  if (!filter) return false;

  await prisma.$transaction([
    prisma.filterValue.deleteMany({ where: { filterId } }),
    ...values.map((value, index) =>
      prisma.filterValue.create({
        data: {
          filterId,
          value: value.value,
          label: value.label ?? null,
          swatchColor: value.swatchColor ?? null,
          swatchImage: value.swatchImage ?? null,
          position: value.position ?? index,
          hidden: value.hidden ?? false,
        },
      }),
    ),
  ]);

  return true;
}

/**
 * Caches the counts observed for a filter's values so the admin can show real
 * data without a live storefront query.
 */
export async function cacheValueCounts(
  shopId: string,
  filterId: string,
  counts: { value: string; count: number }[],
): Promise<void> {
  const filter = await prisma.filter.findFirst({
    where: { id: filterId, shopId },
    select: { id: true },
  });
  if (!filter) return;

  await prisma.$transaction(
    counts.map(({ value, count }) =>
      prisma.filterValue.upsert({
        where: { filterId_value: { filterId, value } },
        update: { cachedCount: count },
        create: { filterId, value, cachedCount: count },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Group writes
// ---------------------------------------------------------------------------

export async function createGroup(
  shopId: string,
  input: FilterGroupInput,
): Promise<FilterGroup> {
  const handle = await uniqueGroupHandle(shopId, input.handle ?? input.name);
  const last = await prisma.filterGroup.findFirst({
    where: { shopId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.filterGroup.create({
    data: {
      shopId,
      name: input.name,
      handle,
      position: (last?.position ?? -1) + 1,
      enabled: input.enabled,
      defaultOpen: input.defaultOpen,
      collapsible: input.collapsible,
    },
  });
}

export async function updateGroup(
  shopId: string,
  id: string,
  input: FilterGroupInput,
): Promise<FilterGroup | null> {
  const existing = await prisma.filterGroup.findFirst({
    where: { id, shopId },
    select: { id: true, handle: true },
  });
  if (!existing) return null;

  const handle =
    input.handle && input.handle !== existing.handle
      ? await uniqueGroupHandle(shopId, input.handle, id)
      : existing.handle;

  return prisma.filterGroup.update({
    where: { id },
    data: {
      name: input.name,
      handle,
      enabled: input.enabled,
      defaultOpen: input.defaultOpen,
      collapsible: input.collapsible,
    },
  });
}

/** Deleting a group leaves its filters in place, ungrouped (schema: SetNull). */
export async function deleteGroup(
  shopId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.filterGroup.deleteMany({ where: { id, shopId } });
  return result.count > 0;
}

export async function reorderGroups(
  shopId: string,
  ids: string[],
): Promise<void> {
  const owned = await prisma.filterGroup.findMany({
    where: { shopId, id: { in: ids } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));

  await prisma.$transaction(
    ids
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.filterGroup.update({ where: { id }, data: { position: index } }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Config blob helpers
// ---------------------------------------------------------------------------

export interface FilterConfig extends Record<string, unknown> {
  /** Range filters: step for the slider. */
  step?: number;
  /** Range filters: unit shown next to the inputs. */
  unit?: string;
  /** Rating filters: thresholds offered, defaults to 5..1. */
  ratingBuckets?: number[];
  /** Boolean filters: the label shown next to the single checkbox. */
  booleanLabel?: string;
}

export function readFilterConfig(filter: Filter): FilterConfig {
  return parseJsonObject<FilterConfig>(filter.config, {});
}
