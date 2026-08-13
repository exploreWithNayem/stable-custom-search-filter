/**
 * Cross-shop isolation (CLAUDE.md §5.3, §16, §18).
 *
 * This is the test that must never be deleted. Every model function takes a
 * shopId, and the point of these cases is that passing the WRONG shopId with a
 * VALID id from another shop resolves to nothing — never to the other shop's row.
 *
 * Runs against a real SQLite database so cascades and unique constraints are
 * exercised rather than mocked.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import prisma from "../app/db.server";
import { ensureShop, markShopUninstalled, purgeShop } from "../app/models/shop.server";
import {
  createFilter,
  createGroup,
  deleteFilter,
  duplicateFilter,
  getFilter,
  listFilters,
  replaceFilterValues,
  reorderFilters,
  setFilterEnabled,
  updateFilter,
} from "../app/models/filter.server";
import {
  getCollectionFilterByHandle,
  upsertCollectionFilter,
} from "../app/models/collection.server";
import { upsertSynonym, listSynonyms, deleteSynonym } from "../app/models/search.server";
import {
  getSearchSummary,
  recordFilterEvent,
  recordSearchEvent,
  resolveDateRange,
  getTopFilters,
} from "../app/models/analytics.server";
import { consumeUsage, getUsage, setSubscriptionPlan } from "../app/models/usage.server";
import type { FilterInput } from "../app/lib/validation";

const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";

function filterInput(overrides: Partial<FilterInput> = {}): FilterInput {
  return {
    name: "Colour",
    source: "product_option",
    sourceKey: "Color",
    displayType: "checkbox",
    enabled: true,
    multiSelect: true,
    showCount: true,
    hideEmpty: true,
    collapsedByDefault: false,
    searchableValues: false,
    maxVisibleValues: 8,
    valueSort: "count",
    config: {},
    ...overrides,
  } as FilterInput;
}

let shopA: string;
let shopB: string;

beforeAll(() => {
  // Fresh database per run so results never depend on leftover state.
  const dbPath = "./test.sqlite";
  if (existsSync(dbPath)) rmSync(dbPath);

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.sqlite" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Order matters: analytics tables have no FK, so clear them explicitly.
  await prisma.searchEvent.deleteMany();
  await prisma.filterEvent.deleteMany();
  await prisma.searchTermStat.deleteMany();
  await prisma.filterUsageStat.deleteMany();
  await prisma.shop.deleteMany();

  shopA = (await ensureShop(SHOP_A)).id;
  shopB = (await ensureShop(SHOP_B)).id;
});

describe("shop provisioning", () => {
  it("creates the singleton child rows on install", async () => {
    const [config, settings, subscription] = await Promise.all([
      prisma.searchConfiguration.findUnique({ where: { shopId: shopA } }),
      prisma.appSettings.findUnique({ where: { shopId: shopA } }),
      prisma.subscription.findUnique({ where: { shopId: shopA } }),
    ]);

    expect(config).not.toBeNull();
    expect(settings).not.toBeNull();
    expect(subscription?.plan).toBe("free");
  });

  it("is idempotent", async () => {
    const again = await ensureShop(SHOP_A);
    expect(again.id).toBe(shopA);
    expect(await prisma.shop.count()).toBe(2);
  });

  it("clears the uninstall marker on re-install so setup survives", async () => {
    await createFilter(shopA, filterInput());
    await markShopUninstalled(SHOP_A);

    expect((await prisma.shop.findUnique({ where: { id: shopA } }))?.uninstalledAt)
      .not.toBeNull();

    const reinstalled = await ensureShop(SHOP_A);
    expect(reinstalled.uninstalledAt).toBeNull();
    // The merchant's configuration is still there.
    expect(await listFilters(shopA)).toHaveLength(1);
  });
});

describe("filters are shop-scoped", () => {
  it("does not read another shop's filter by id", async () => {
    const filter = await createFilter(shopA, filterInput());

    expect(await getFilter(shopA, filter.id)).not.toBeNull();
    expect(await getFilter(shopB, filter.id)).toBeNull();
  });

  it("does not list another shop's filters", async () => {
    await createFilter(shopA, filterInput({ name: "A filter" }));
    expect(await listFilters(shopA)).toHaveLength(1);
    expect(await listFilters(shopB)).toHaveLength(0);
  });

  it("does not update another shop's filter", async () => {
    const filter = await createFilter(shopA, filterInput());

    const result = await updateFilter(shopB, filter.id, filterInput({ name: "Hijacked" }));
    expect(result).toBeNull();

    const untouched = await getFilter(shopA, filter.id);
    expect(untouched?.name).toBe("Colour");
  });

  it("does not delete another shop's filter", async () => {
    const filter = await createFilter(shopA, filterInput());

    expect(await deleteFilter(shopB, filter.id)).toBe(false);
    expect(await getFilter(shopA, filter.id)).not.toBeNull();

    expect(await deleteFilter(shopA, filter.id)).toBe(true);
    expect(await getFilter(shopA, filter.id)).toBeNull();
  });

  it("does not toggle or duplicate another shop's filter", async () => {
    const filter = await createFilter(shopA, filterInput());

    expect(await setFilterEnabled(shopB, filter.id, false)).toBe(false);
    expect((await getFilter(shopA, filter.id))?.enabled).toBe(true);

    expect(await duplicateFilter(shopB, filter.id)).toBeNull();
    expect(await listFilters(shopB)).toHaveLength(0);
  });

  it("does not write values onto another shop's filter", async () => {
    const filter = await createFilter(shopA, filterInput());

    expect(
      await replaceFilterValues(shopB, filter.id, [
        { value: "Black", label: "Injected", position: 0, hidden: false },
      ]),
    ).toBe(false);

    expect((await getFilter(shopA, filter.id))?.values).toHaveLength(0);
  });

  it("ignores foreign ids when reordering", async () => {
    const a1 = await createFilter(shopA, filterInput({ name: "One" }));
    const a2 = await createFilter(shopA, filterInput({ name: "Two" }));
    const b1 = await createFilter(shopB, filterInput({ name: "Other" }));

    // Shop A tries to reorder including shop B's id.
    await reorderFilters(shopA, [a2.id, b1.id, a1.id]);

    const ordered = await listFilters(shopA);
    expect(ordered.map((f) => f.name)).toEqual(["Two", "One"]);

    // Shop B's filter kept its own position.
    expect((await getFilter(shopB, b1.id))?.position).toBe(0);
  });

  it("does not attach another shop's group to a filter", async () => {
    const groupB = await createGroup(shopB, {
      name: "Theirs",
      enabled: true,
      defaultOpen: true,
      collapsible: true,
    });

    const filter = await createFilter(shopA, filterInput({ groupId: groupB.id }));

    // The cross-shop group id is dropped rather than written.
    expect(filter.groupId).toBeNull();
  });

  it("keeps handles unique per shop but allows the same handle in both", async () => {
    const a = await createFilter(shopA, filterInput({ name: "Colour" }));
    const b = await createFilter(shopB, filterInput({ name: "Colour" }));
    expect(a.handle).toBe("colour");
    expect(b.handle).toBe("colour");

    const duplicate = await createFilter(shopA, filterInput({ name: "Colour" }));
    expect(duplicate.handle).toBe("colour-2");
  });
});

describe("collections and search config are shop-scoped", () => {
  it("does not read another shop's collection configuration", async () => {
    await upsertCollectionFilter(shopA, {
      collectionGid: "gid://shopify/Collection/1",
      collectionHandle: "shoes",
      title: null,
      enabled: true,
      useDefault: false,
      layout: "sidebar",
      filterIds: [],
      settings: {},
    });

    expect(await getCollectionFilterByHandle(shopA, "shoes")).not.toBeNull();
    expect(await getCollectionFilterByHandle(shopB, "shoes")).toBeNull();
  });

  it("drops another shop's filter ids from a collection assignment", async () => {
    const foreign = await createFilter(shopB, filterInput());

    const record = await upsertCollectionFilter(shopA, {
      collectionGid: "gid://shopify/Collection/2",
      collectionHandle: "boots",
      title: null,
      enabled: true,
      useDefault: false,
      layout: "sidebar",
      filterIds: [foreign.id],
      settings: {},
    });

    expect(record.items).toHaveLength(0);
  });

  it("does not delete another shop's synonym", async () => {
    const synonym = await upsertSynonym(shopA, {
      term: "sneakers",
      synonyms: ["shoes"],
      bidirectional: true,
      enabled: true,
    });

    expect(await deleteSynonym(shopB, synonym.id)).toBe(false);
    expect(await listSynonyms(shopA)).toHaveLength(1);
    expect(await listSynonyms(shopB)).toHaveLength(0);
  });
});

describe("analytics are shop-scoped", () => {
  it("does not mix shops in search reporting", async () => {
    await recordSearchEvent({ shopId: shopA, term: "Boots", resultCount: 4 });
    await recordSearchEvent({ shopId: shopA, term: "boots", resultCount: 4 });
    await recordSearchEvent({ shopId: shopB, term: "sandals", resultCount: 0 });

    const range = resolveDateRange("today");

    const summaryA = await getSearchSummary(shopA, range);
    expect(summaryA.totalSearches).toBe(2);
    // "Boots" and "boots" normalise to one term.
    expect(summaryA.uniqueTerms).toBe(1);

    const summaryB = await getSearchSummary(shopB, range);
    expect(summaryB.totalSearches).toBe(1);
    expect(summaryB.zeroResultSearches).toBe(1);
  });

  it("does not mix shops in filter reporting", async () => {
    await recordFilterEvent({
      shopId: shopA,
      filterHandle: "color",
      filterValue: "Black",
      resultCount: 3,
      collectionHandle: "shoes",
    });
    await recordFilterEvent({
      shopId: shopB,
      filterHandle: "size",
      filterValue: "40",
      resultCount: 1,
    });

    const range = resolveDateRange("today");
    expect((await getTopFilters(shopA, range)).map((f) => f.filterHandle)).toEqual([
      "color",
    ]);
    expect((await getTopFilters(shopB, range)).map((f) => f.filterHandle)).toEqual([
      "size",
    ]);
  });

  it("increments the daily rollup rather than inserting duplicates", async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordSearchEvent({ shopId: shopA, term: "boots", resultCount: 2 });
    }

    const rows = await prisma.searchTermStat.findMany({ where: { shopId: shopA } });
    expect(rows).toHaveLength(1);
    expect(rows[0].searches).toBe(3);
  });

  it("counts a click separately from a search", async () => {
    await recordSearchEvent({ shopId: shopA, term: "boots", resultCount: 5 });
    await recordSearchEvent({
      shopId: shopA,
      term: "boots",
      resultCount: 5,
      clickedProductId: "gid://shopify/Product/1",
    });

    const summary = await getSearchSummary(shopA, resolveDateRange("today"));
    expect(summary.totalSearches).toBe(1);
    expect(summary.clicks).toBe(1);
    expect(summary.clickThroughRate).toBe(1);
  });
});

describe("usage metering", () => {
  it("stops at the plan limit and keeps shops independent", async () => {
    await setSubscriptionPlan(shopA, "free");
    const limit = 1_000;

    // Fill to just below the limit in one write, then step over it.
    await prisma.usage.create({
      data: {
        shopId: shopA,
        periodKey: new Date().toISOString().slice(0, 7),
        searches: limit - 1,
      },
    });

    expect(await consumeUsage(shopA, "searches")).toBe(true);
    expect(await consumeUsage(shopA, "searches")).toBe(false);

    // Shop B is unaffected by shop A hitting its ceiling.
    expect(await consumeUsage(shopB, "searches")).toBe(true);

    const usageA = await getUsage(shopA);
    expect(usageA.overSearches).toBe(true);
    const usageB = await getUsage(shopB);
    expect(usageB.overSearches).toBe(false);
  });

  it("treats an unlimited plan as never over quota", async () => {
    await setSubscriptionPlan(shopA, "pro");
    const usage = await getUsage(shopA);
    expect(usage.limits.searches).toBeNull();
    expect(usage.overSearches).toBe(false);
  });

  it("falls back to Free entitlements when a subscription lapses", async () => {
    await setSubscriptionPlan(shopA, "pro", { status: "expired" });
    const usage = await getUsage(shopA);
    // Free limits apply again, not Pro's unlimited.
    expect(usage.limits.searches).toBe(1_000);
  });
});

describe("cascade and purge", () => {
  it("cascades child rows when a shop is deleted", async () => {
    const filter = await createFilter(shopA, filterInput());
    await replaceFilterValues(shopA, filter.id, [
      { value: "Black", label: null, position: 0, hidden: false },
    ]);
    await recordSearchEvent({ shopId: shopA, term: "boots", resultCount: 1 });

    await purgeShop(SHOP_A);

    expect(await prisma.shop.findUnique({ where: { id: shopA } })).toBeNull();
    expect(await prisma.filter.count({ where: { shopId: shopA } })).toBe(0);
    expect(await prisma.filterValue.count({ where: { filterId: filter.id } })).toBe(0);
    expect(await prisma.searchConfiguration.count({ where: { shopId: shopA } })).toBe(0);
    // Analytics tables have no FK, so purgeShop must clear them explicitly.
    expect(await prisma.searchEvent.count({ where: { shopId: shopA } })).toBe(0);
    expect(await prisma.searchTermStat.count({ where: { shopId: shopA } })).toBe(0);

    // Shop B survives untouched.
    expect(await prisma.shop.findUnique({ where: { id: shopB } })).not.toBeNull();
  });

  it("leaves filters ungrouped when their group is deleted", async () => {
    const group = await createGroup(shopA, {
      name: "Style",
      enabled: true,
      defaultOpen: true,
      collapsible: true,
    });
    const filter = await createFilter(shopA, filterInput({ groupId: group.id }));
    expect(filter.groupId).toBe(group.id);

    await prisma.filterGroup.delete({ where: { id: group.id } });

    const survivor = await getFilter(shopA, filter.id);
    expect(survivor).not.toBeNull();
    expect(survivor?.groupId).toBeNull();
  });
});
