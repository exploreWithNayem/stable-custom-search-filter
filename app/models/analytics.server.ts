/**
 * Analytics capture and reporting (CLAUDE.md §14).
 *
 * Writes go to a raw event table AND a daily rollup in the same transaction.
 * Dashboards read only the rollups — they must never scan raw events, which is
 * why the rollup exists at all (§5.1).
 */

import prisma from "../db.server";

export type DateRangeKey =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "custom";

export interface DateRange {
  start: Date;
  end: Date;
  key: DateRangeKey;
}

/** UTC midnight for the day a timestamp falls in — the rollup bucket key. */
export function toUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function resolveDateRange(
  key: string | null,
  customStart?: string | null,
  customEnd?: string | null,
  now: Date = new Date(),
): DateRange {
  const today = toUtcDay(now);
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (key) {
    case "today":
      return { start: today, end: endOfToday, key: "today" };
    case "this_month":
      return {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: endOfToday,
        key: "this_month",
      };
    case "custom": {
      const start = customStart ? new Date(customStart) : today;
      const end = customEnd ? new Date(customEnd) : endOfToday;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return resolveDateRange("last_30_days", null, null, now);
      }
      return { start: toUtcDay(start), end, key: "custom" };
    }
    case "last_7_days":
      return {
        start: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        end: endOfToday,
        key: "last_7_days",
      };
    case "last_30_days":
    default:
      return {
        start: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000),
        end: endOfToday,
        key: "last_30_days",
      };
  }
}

/** Lowercase, collapse whitespace — the key used for grouping and synonyms. */
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface SearchEventInput {
  shopId: string;
  term: string;
  resultCount: number;
  kind?: "search" | "predictive";
  collectionHandle?: string | null;
  clickedProductId?: string | null;
  sessionHash?: string | null;
  locale?: string | null;
}

export async function recordSearchEvent(input: SearchEventInput): Promise<void> {
  const normalizedTerm = normalizeTerm(input.term);
  if (!normalizedTerm) return;

  const day = toUtcDay(new Date());
  const isZeroResult = input.resultCount === 0;
  const isClick = Boolean(input.clickedProductId);

  await prisma.$transaction([
    prisma.searchEvent.create({
      data: {
        shopId: input.shopId,
        term: input.term.slice(0, 128),
        normalizedTerm,
        resultCount: input.resultCount,
        kind: input.kind ?? "search",
        collectionHandle: input.collectionHandle ?? null,
        clickedProductId: input.clickedProductId ?? null,
        sessionHash: input.sessionHash ?? null,
        locale: input.locale ?? null,
      },
    }),
    prisma.searchTermStat.upsert({
      where: {
        shopId_day_normalizedTerm: {
          shopId: input.shopId,
          day,
          normalizedTerm,
        },
      },
      update: {
        searches: { increment: isClick ? 0 : 1 },
        zeroResults: { increment: isZeroResult && !isClick ? 1 : 0 },
        clicks: { increment: isClick ? 1 : 0 },
      },
      create: {
        shopId: input.shopId,
        day,
        normalizedTerm,
        searches: isClick ? 0 : 1,
        zeroResults: isZeroResult && !isClick ? 1 : 0,
        clicks: isClick ? 1 : 0,
      },
    }),
  ]);
}

export interface FilterEventInput {
  shopId: string;
  filterHandle: string;
  filterValue: string;
  resultCount: number;
  collectionHandle?: string | null;
  sessionHash?: string | null;
}

export async function recordFilterEvent(input: FilterEventInput): Promise<void> {
  const day = toUtcDay(new Date());
  const collectionHandle = input.collectionHandle ?? "";

  await prisma.$transaction([
    prisma.filterEvent.create({
      data: {
        shopId: input.shopId,
        filterHandle: input.filterHandle,
        filterValue: input.filterValue,
        resultCount: input.resultCount,
        collectionHandle: input.collectionHandle ?? null,
        sessionHash: input.sessionHash ?? null,
      },
    }),
    prisma.filterUsageStat.upsert({
      where: {
        shopId_day_filterHandle_filterValue_collectionHandle: {
          shopId: input.shopId,
          day,
          filterHandle: input.filterHandle,
          filterValue: input.filterValue,
          collectionHandle,
        },
      },
      update: { uses: { increment: 1 } },
      create: {
        shopId: input.shopId,
        day,
        filterHandle: input.filterHandle,
        filterValue: input.filterValue,
        collectionHandle,
        uses: 1,
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Reporting — all reads hit the rollups
// ---------------------------------------------------------------------------

export interface SearchSummary {
  totalSearches: number;
  zeroResultSearches: number;
  clicks: number;
  clickThroughRate: number;
  uniqueTerms: number;
}

export async function getSearchSummary(
  shopId: string,
  range: DateRange,
): Promise<SearchSummary> {
  const rows = await prisma.searchTermStat.groupBy({
    by: ["shopId"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { searches: true, zeroResults: true, clicks: true },
    _count: { _all: true },
  });

  const row = rows[0];
  const totalSearches = row?._sum.searches ?? 0;
  const clicks = row?._sum.clicks ?? 0;

  return {
    totalSearches,
    zeroResultSearches: row?._sum.zeroResults ?? 0,
    clicks,
    clickThroughRate: totalSearches > 0 ? clicks / totalSearches : 0,
    uniqueTerms: row?._count._all ?? 0,
  };
}

export interface TermStat {
  term: string;
  searches: number;
  zeroResults: number;
  clicks: number;
}

export async function getTopSearchTerms(
  shopId: string,
  range: DateRange,
  limit = 10,
): Promise<TermStat[]> {
  const rows = await prisma.searchTermStat.groupBy({
    by: ["normalizedTerm"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { searches: true, zeroResults: true, clicks: true },
    orderBy: { _sum: { searches: "desc" } },
    take: Math.min(limit, 100),
  });

  return rows.map((row) => ({
    term: row.normalizedTerm,
    searches: row._sum.searches ?? 0,
    zeroResults: row._sum.zeroResults ?? 0,
    clicks: row._sum.clicks ?? 0,
  }));
}

export async function getZeroResultTerms(
  shopId: string,
  range: DateRange,
  limit = 20,
): Promise<TermStat[]> {
  const rows = await prisma.searchTermStat.groupBy({
    by: ["normalizedTerm"],
    where: {
      shopId,
      day: { gte: range.start, lte: range.end },
      zeroResults: { gt: 0 },
    },
    _sum: { searches: true, zeroResults: true, clicks: true },
    orderBy: { _sum: { zeroResults: "desc" } },
    take: Math.min(limit, 200),
  });

  return rows.map((row) => ({
    term: row.normalizedTerm,
    searches: row._sum.searches ?? 0,
    zeroResults: row._sum.zeroResults ?? 0,
    clicks: row._sum.clicks ?? 0,
  }));
}

export interface DailyPoint {
  day: string;
  value: number;
}

export async function getSearchTimeseries(
  shopId: string,
  range: DateRange,
): Promise<DailyPoint[]> {
  const rows = await prisma.searchTermStat.groupBy({
    by: ["day"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { searches: true },
    orderBy: { day: "asc" },
  });

  return rows.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    value: row._sum.searches ?? 0,
  }));
}

export async function getFilterInteractionTotal(
  shopId: string,
  range: DateRange,
): Promise<number> {
  const rows = await prisma.filterUsageStat.groupBy({
    by: ["shopId"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { uses: true },
  });
  return rows[0]?._sum.uses ?? 0;
}

export interface FilterStat {
  filterHandle: string;
  uses: number;
}

export async function getTopFilters(
  shopId: string,
  range: DateRange,
  limit = 10,
): Promise<FilterStat[]> {
  const rows = await prisma.filterUsageStat.groupBy({
    by: ["filterHandle"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { uses: true },
    orderBy: { _sum: { uses: "desc" } },
    take: Math.min(limit, 100),
  });

  return rows.map((row) => ({
    filterHandle: row.filterHandle,
    uses: row._sum.uses ?? 0,
  }));
}

export interface FilterValueStat {
  filterHandle: string;
  filterValue: string;
  uses: number;
}

export async function getTopFilterValues(
  shopId: string,
  range: DateRange,
  limit = 10,
): Promise<FilterValueStat[]> {
  const rows = await prisma.filterUsageStat.groupBy({
    by: ["filterHandle", "filterValue"],
    where: { shopId, day: { gte: range.start, lte: range.end } },
    _sum: { uses: true },
    orderBy: { _sum: { uses: "desc" } },
    take: Math.min(limit, 100),
  });

  return rows.map((row) => ({
    filterHandle: row.filterHandle,
    filterValue: row.filterValue,
    uses: row._sum.uses ?? 0,
  }));
}

export interface CollectionStat {
  collectionHandle: string;
  uses: number;
}

export async function getTopFilteredCollections(
  shopId: string,
  range: DateRange,
  limit = 10,
): Promise<CollectionStat[]> {
  const rows = await prisma.filterUsageStat.groupBy({
    by: ["collectionHandle"],
    where: {
      shopId,
      day: { gte: range.start, lte: range.end },
      collectionHandle: { not: "" },
    },
    _sum: { uses: true },
    orderBy: { _sum: { uses: "desc" } },
    take: Math.min(limit, 100),
  });

  return rows.map((row) => ({
    collectionHandle: row.collectionHandle,
    uses: row._sum.uses ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Deletes raw events beyond the retention window. Rollups are kept far longer
 * (they are tiny), so history in the dashboard survives the prune.
 */
export async function pruneRawEvents(
  shopId: string,
  retentionDays: number,
): Promise<{ searches: number; filters: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [searches, filters] = await prisma.$transaction([
    prisma.searchEvent.deleteMany({
      where: { shopId, createdAt: { lt: cutoff } },
    }),
    prisma.filterEvent.deleteMany({
      where: { shopId, createdAt: { lt: cutoff } },
    }),
  ]);

  return { searches: searches.count, filters: filters.count };
}
