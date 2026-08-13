/**
 * Per-collection filter configuration (CLAUDE.md §8.5).
 *
 * Resolution order: an enabled CollectionFilter with `useDefault: false` wins;
 * anything else falls back to the shop's default filter set.
 */

import type { CollectionFilter, CollectionFilterItem } from "@prisma/client";
import prisma from "../db.server";
import { stringifyJson } from "../lib/json";
import type { CollectionFilterInput } from "../lib/validation";

export type CollectionFilterWithItems = CollectionFilter & {
  items: CollectionFilterItem[];
};

export async function listCollectionFilters(
  shopId: string,
): Promise<CollectionFilterWithItems[]> {
  return prisma.collectionFilter.findMany({
    where: { shopId },
    include: { items: { orderBy: { position: "asc" } } },
    orderBy: { collectionHandle: "asc" },
  });
}

export async function countConfiguredCollections(
  shopId: string,
): Promise<number> {
  return prisma.collectionFilter.count({
    where: { shopId, useDefault: false },
  });
}

export async function getCollectionFilterByHandle(
  shopId: string,
  collectionHandle: string,
): Promise<CollectionFilterWithItems | null> {
  return prisma.collectionFilter.findFirst({
    where: { shopId, collectionHandle },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

export async function getCollectionFilterByGid(
  shopId: string,
  collectionGid: string,
): Promise<CollectionFilterWithItems | null> {
  return prisma.collectionFilter.findFirst({
    where: { shopId, collectionGid },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

/**
 * Creates or replaces a collection's configuration, including its ordered
 * filter list. Filter ids that do not belong to the shop are dropped.
 */
export async function upsertCollectionFilter(
  shopId: string,
  input: CollectionFilterInput,
): Promise<CollectionFilterWithItems> {
  const ownedFilters = await prisma.filter.findMany({
    where: { shopId, id: { in: input.filterIds } },
    select: { id: true },
  });
  const ownedIds = new Set(ownedFilters.map((row) => row.id));
  const orderedIds = input.filterIds.filter((id) => ownedIds.has(id));

  const data = {
    collectionHandle: input.collectionHandle,
    title: input.title ?? null,
    enabled: input.enabled,
    useDefault: input.useDefault,
    layout: input.layout,
    settings: stringifyJson(input.settings),
  };

  const record = await prisma.collectionFilter.upsert({
    where: {
      shopId_collectionGid: {
        shopId,
        collectionGid: input.collectionGid,
      },
    },
    update: data,
    create: { shopId, collectionGid: input.collectionGid, ...data },
  });

  await prisma.$transaction([
    prisma.collectionFilterItem.deleteMany({
      where: { collectionFilterId: record.id },
    }),
    ...orderedIds.map((filterId, index) =>
      prisma.collectionFilterItem.create({
        data: {
          collectionFilterId: record.id,
          filterId,
          position: index,
          enabled: true,
        },
      }),
    ),
  ]);

  return (await prisma.collectionFilter.findUnique({
    where: { id: record.id },
    include: { items: { orderBy: { position: "asc" } } },
  }))!;
}

export async function deleteCollectionFilter(
  shopId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.collectionFilter.deleteMany({
    where: { id, shopId },
  });
  return result.count > 0;
}

/** Called by the `collections/delete` webhook. */
export async function deleteCollectionFilterByGid(
  shopId: string,
  collectionGid: string,
): Promise<void> {
  await prisma.collectionFilter.deleteMany({ where: { shopId, collectionGid } });
}
