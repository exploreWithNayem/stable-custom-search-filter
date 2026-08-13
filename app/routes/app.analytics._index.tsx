/** Analytics dashboard with zero-result reporting and CSV export (CLAUDE.md §28-§29, Phase 14). */

import type { LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  getFilterInteractionTotal,
  getSearchSummary,
  getSearchTimeseries,
  getTopFilterValues,
  getTopFilters,
  getTopFilteredCollections,
  getTopSearchTerms,
  getZeroResultTerms,
  resolveDateRange,
} from "../models/analytics.server";
import { BarList, Sparkline, StatCard } from "../components/admin/ui";
import { planAllows } from "../config/plans";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
] as const;

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          // Quote anything that could break a CSV cell.
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const url = new URL(request.url);

  const range = resolveDateRange(
    url.searchParams.get("range"),
    url.searchParams.get("start"),
    url.searchParams.get("end"),
  );

  const [
    summary,
    filterInteractions,
    topSearches,
    zeroResults,
    topFilters,
    topValues,
    topCollections,
    timeseries,
  ] = await Promise.all([
    getSearchSummary(shop.id, range),
    getFilterInteractionTotal(shop.id, range),
    getTopSearchTerms(shop.id, range, 10),
    getZeroResultTerms(shop.id, range, 50),
    getTopFilters(shop.id, range, 10),
    getTopFilterValues(shop.id, range, 10),
    getTopFilteredCollections(shop.id, range, 10),
    getSearchTimeseries(shop.id, range),
  ]);

  // CSV export streams straight from the loader — no separate route needed.
  if (url.searchParams.get("export") === "zero-results") {
    const csv = toCsv([
      ["Term", "Searches", "Zero-result searches"],
      ...zeroResults.map((row) => [row.term, row.searches, row.zeroResults]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="zero-result-searches-${range.key}.csv"`,
      },
    });
  }

  return {
    advanced: planAllows(plan.key, "advancedAnalytics"),
    planName: plan.name,
    rangeKey: range.key,
    summary,
    filterInteractions,
    topSearches,
    zeroResults: zeroResults.slice(0, 20),
    zeroResultTotal: zeroResults.length,
    topFilters,
    topValues,
    topCollections,
    timeseries,
  };
};

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  // The CSV branch returns a Response, so `data` is always the object here.
  const {
    summary,
    filterInteractions,
    topSearches,
    zeroResults,
    zeroResultTotal,
    topFilters,
    topValues,
    topCollections,
    timeseries,
    rangeKey,
    advanced,
    planName,
  } = data;

  const ctr = `${(summary.clickThroughRate * 100).toFixed(1)}%`;

  return (
    <s-page heading="Analytics">
      <s-section heading="Date range">
        <Form method="get">
          <s-stack direction="inline" gap="base">
            <s-select name="range" label="Range" value={rangeKey}>
              {RANGES.map((range) => (
                <s-option key={range.value} value={range.value}>
                  {range.label}
                </s-option>
              ))}
            </s-select>
            <s-date-field name="start" label="From" value={searchParams.get("start") ?? ""} />
            <s-date-field name="end" label="To" value={searchParams.get("end") ?? ""} />
            <s-button type="submit" variant="secondary">
              Apply
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Search">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <StatCard label="Total searches" value={summary.totalSearches} />
          <StatCard label="Unique terms" value={summary.uniqueTerms} />
          <StatCard
            label="Zero-result searches"
            value={summary.zeroResultSearches}
            helpText={summary.zeroResultSearches > 0 ? "Needs attention" : undefined}
            tone={summary.zeroResultSearches > 0 ? "warning" : undefined}
          />
          <StatCard label="Click-through rate" value={ctr} />
        </s-grid>

        {timeseries.length > 1 ? (
          <>
            <s-divider />
            <Sparkline points={timeseries} />
          </>
        ) : null}
      </s-section>

      <s-section heading="Top search terms">
        <BarList
          items={topSearches.map((entry) => ({
            label: entry.term,
            value: entry.searches,
            secondary: `${entry.searches} searches · ${entry.clicks} clicks`,
          }))}
          emptyLabel="No searches in this range."
        />
      </s-section>

      <s-section heading="Zero-result searches">
        <s-paragraph>
          Terms shoppers searched for that returned nothing. Each one is a chance to
          add a synonym, a redirect, or a product.
        </s-paragraph>

        {zeroResults.length === 0 ? (
          <s-paragraph>No zero-result searches in this range. Nice.</s-paragraph>
        ) : (
          <>
            <s-table>
              <s-table-header-row>
                <s-table-header>Term</s-table-header>
                <s-table-header>Searches</s-table-header>
                <s-table-header>No results</s-table-header>
                <s-table-header>Fix</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {zeroResults.map((row) => (
                  <s-table-row key={row.term}>
                    <s-table-cell>{row.term}</s-table-cell>
                    <s-table-cell>{row.searches.toLocaleString()}</s-table-cell>
                    <s-table-cell>{row.zeroResults.toLocaleString()}</s-table-cell>
                    <s-table-cell>
                      <s-link href="/app/search">Add synonym or redirect</s-link>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>

            {zeroResultTotal > zeroResults.length ? (
              <s-paragraph>
                Showing the top {zeroResults.length} of {zeroResultTotal}. Export for
                the full list.
              </s-paragraph>
            ) : null}

            <s-button
              variant="secondary"
              href={`/app/analytics?range=${rangeKey}&export=zero-results`}
            >
              Export CSV
            </s-button>
          </>
        )}
      </s-section>

      <s-section heading="Filters">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <StatCard label="Filter interactions" value={filterInteractions} />
          <StatCard label="Filters used" value={topFilters.length} />
        </s-grid>

        <s-divider />

        <s-heading>Most used filters</s-heading>
        <BarList
          items={topFilters.map((entry) => ({
            label: entry.filterHandle,
            value: entry.uses,
          }))}
          emptyLabel="No filter interactions in this range."
        />

        {advanced ? (
          <>
            <s-divider />
            <s-heading>Most selected values</s-heading>
            <BarList
              items={topValues.map((entry) => ({
                label: `${entry.filterHandle}: ${entry.filterValue}`,
                value: entry.uses,
              }))}
              emptyLabel="No values recorded in this range."
            />

            <s-divider />
            <s-heading>Most filtered collections</s-heading>
            <BarList
              items={topCollections.map((entry) => ({
                label: entry.collectionHandle,
                value: entry.uses,
              }))}
              emptyLabel="No collection context recorded in this range."
            />
          </>
        ) : (
          <s-banner tone="info" heading={`More detail on paid plans`}>
            <s-paragraph>
              The {planName} plan shows totals and top filters. Upgrade to break these
              down by value and collection.
            </s-paragraph>
            <s-button href="/app/pricing">View plans</s-button>
          </s-banner>
        )}
      </s-section>
    </s-page>
  );
}
