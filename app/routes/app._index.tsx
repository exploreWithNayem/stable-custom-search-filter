/** Dashboard (CLAUDE.md §33, Phase 4). */

import type { HeadersArgs, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireAdminContext } from "../services/shop/context.server";
import { countFilters, countGroups } from "../models/filter.server";
import { countConfiguredCollections } from "../models/collection.server";
import { listActivity } from "../models/activity.server";
import {
  getFilterInteractionTotal,
  getSearchSummary,
  getTopFilters,
  getTopSearchTerms,
  resolveDateRange,
} from "../models/analytics.server";
import { getUsage } from "../models/usage.server";
import { BarList, StatCard, UsageMeter } from "../components/admin/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const range = resolveDateRange("last_30_days");

  const [
    totalFilters,
    activeFilters,
    groups,
    collections,
    searchSummary,
    filterInteractions,
    topSearches,
    topFilters,
    activity,
    usage,
  ] = await Promise.all([
    countFilters(shop.id),
    countFilters(shop.id, { enabledOnly: true }),
    countGroups(shop.id),
    countConfiguredCollections(shop.id),
    getSearchSummary(shop.id, range),
    getFilterInteractionTotal(shop.id, range),
    getTopSearchTerms(shop.id, range, 5),
    getTopFilters(shop.id, range, 5),
    listActivity(shop.id, 8),
    getUsage(shop.id, plan.key),
  ]);

  return {
    plan: { key: plan.key, name: plan.name },
    onboarded: totalFilters > 0,
    stats: {
      totalFilters,
      activeFilters,
      groups,
      collections,
      searches: searchSummary.totalSearches,
      filterInteractions,
    },
    topSearches,
    topFilters,
    activity: activity.map((entry) => ({
      id: entry.id,
      summary: entry.summary,
      action: entry.action,
      createdAt: entry.createdAt.toISOString(),
    })),
    usage,
  };
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function Dashboard() {
  const { plan, onboarded, stats, topSearches, topFilters, activity, usage } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Stable Custom Filter & Search">
      <s-button slot="primary-action" href="/app/filters/new">
        Create filter
      </s-button>

      {!onboarded ? (
        <s-section heading="Get started">
          <s-paragraph>
            Create your first filter, then add the <strong>Products &amp; filter</strong>{" "}
            block to a collection page in your theme editor.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button href="/app/filters/new">Create your first filter</s-button>
            <s-button variant="tertiary" href="/app/help">
              Setup guide
            </s-button>
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <StatCard label="Total filters" value={stats.totalFilters} />
          <StatCard label="Active filters" value={stats.activeFilters} />
          <StatCard label="Filter groups" value={stats.groups} />
          <StatCard label="Configured collections" value={stats.collections} />
          <StatCard label="Searches (30d)" value={stats.searches} />
          <StatCard label="Filter interactions (30d)" value={stats.filterInteractions} />
        </s-grid>
      </s-section>

      <s-section heading="Top searches">
        <BarList
          items={topSearches.map((entry) => ({
            label: entry.term,
            value: entry.searches,
            secondary:
              entry.zeroResults > 0
                ? `${entry.searches} (${entry.zeroResults} with no results)`
                : String(entry.searches),
          }))}
          emptyLabel="No searches recorded yet. Data appears once shoppers use the search block."
        />
      </s-section>

      <s-section heading="Top filters">
        <BarList
          items={topFilters.map((entry) => ({
            label: entry.filterHandle,
            value: entry.uses,
          }))}
          emptyLabel="No filter interactions recorded yet."
        />
      </s-section>

      <s-section slot="aside" heading={`${plan.name} plan`}>
        <s-stack direction="block" gap="base">
          <UsageMeter
            label="Searches this month"
            used={usage.searches}
            limit={usage.limits.searches}
          />
          <UsageMeter
            label="Filter interactions"
            used={usage.filterInteractions}
            limit={usage.limits.filterInteractions}
          />
          {usage.overSearches || usage.overFilterInteractions ? (
            <s-banner tone="warning" heading="Monthly limit reached">
              <s-paragraph>
                New analytics are paused until next month. Filtering and search keep
                working for your shoppers.
              </s-paragraph>
            </s-banner>
          ) : null}
          <s-button href="/app/pricing" variant="secondary">
            Manage plan
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Recent activity">
        {activity.length === 0 ? (
          <s-paragraph>Nothing yet.</s-paragraph>
        ) : (
          <s-unordered-list>
            {activity.map((entry) => (
              <s-list-item key={entry.id}>
                {entry.summary}{" "}
                <s-text color="subdued">{timeAgo(entry.createdAt)}</s-text>
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            <Link to="/app/collections">Configure per-collection filters</Link>
          </s-list-item>
          <s-list-item>
            <Link to="/app/search">Tune search and predictive suggestions</Link>
          </s-list-item>
          <s-list-item>
            <Link to="/app/analytics">Review zero-result searches</Link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs: HeadersArgs) => boundary.headers(headersArgs);
