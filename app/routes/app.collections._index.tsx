/** Collection list with per-collection filter configuration (CLAUDE.md §13.4, Phase 6). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { listCollections } from "../services/admin/collections.server";
import {
  countConfiguredCollections,
  deleteCollectionFilter,
  listCollectionFilters,
} from "../models/collection.server";
import { EmptyState } from "../components/admin/ui";
import { planAllows } from "../config/plans";
import { invalidateShop } from "../lib/cache.server";
import { recordActivity } from "../models/activity.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop, plan } = await requireAdminContext(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const after = url.searchParams.get("after");

  const [page, configured, configuredCount] = await Promise.all([
    listCollections(admin, { first: 25, after, query }),
    listCollectionFilters(shop.id),
    countConfiguredCollections(shop.id),
  ]);

  const byGid = new Map(configured.map((record) => [record.collectionGid, record]));

  return {
    allowed: planAllows(plan.key, "collectionFilters"),
    planName: plan.name,
    limit: plan.limits.configuredCollections,
    configuredCount,
    query: query ?? "",
    hasNextPage: page.hasNextPage,
    endCursor: page.endCursor,
    collections: page.collections.map((collection) => {
      const record = byGid.get(collection.id);
      return {
        ...collection,
        configId: record?.id ?? null,
        useDefault: record?.useDefault ?? true,
        enabled: record?.enabled ?? true,
        filterCount: record?.items.length ?? 0,
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const formData = await request.formData();

  if (String(formData.get("intent")) === "reset") {
    const id = String(formData.get("configId") ?? "");
    const ok = await deleteCollectionFilter(shop.id, id);
    if (ok) {
      await recordActivity({
        shopId: shop.id,
        action: "collection.reset",
        summary: "Reset a collection to the default filter set",
        entityType: "collectionFilter",
        entityId: id,
      });
    }
    invalidateShop(shop.domain);
  }

  return { ok: true };
};

export default function CollectionsIndex() {
  const {
    collections,
    allowed,
    planName,
    limit,
    configuredCount,
    query,
    hasNextPage,
    endCursor,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  return (
    <s-page heading="Collections">
      {!allowed ? (
        <s-banner tone="info" heading="Collection-specific filters need the Standard plan">
          <s-paragraph>
            Every collection currently uses your default filter set. Upgrade to give
            individual collections their own filters and ordering.
          </s-paragraph>
          <s-button href="/app/pricing">View plans</s-button>
        </s-banner>
      ) : null}

      <s-section heading="Your collections">
        <Form method="get">
          <s-stack direction="inline" gap="base">
            <s-search-field
              name="q"
              label="Search collections"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search collections"
              value={query}
            />
            <s-button type="submit" variant="secondary">
              Search
            </s-button>
          </s-stack>
        </Form>

        {collections.length === 0 ? (
          <EmptyState
            heading="No collections found"
            description={
              query
                ? "No collections match that search."
                : "Create a collection in Shopify and it will appear here."
            }
          />
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Collection</s-table-header>
              <s-table-header>Products</s-table-header>
              <s-table-header>Filters</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {collections.map((collection) => (
                <s-table-row key={collection.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      <s-link href={`/app/collections/${collection.handle}`}>
                        {collection.title}
                      </s-link>
                      <s-text color="subdued">{collection.handle}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{collection.productsCount.toLocaleString()}</s-table-cell>
                  <s-table-cell>
                    {collection.useDefault ? (
                      <s-badge tone="neutral">Default set</s-badge>
                    ) : (
                      <s-badge tone="success">
                        {collection.filterCount} custom
                      </s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-400">
                      <s-button
                        variant="tertiary"
                        href={`/app/collections/${collection.handle}`}
                      >
                        Configure
                      </s-button>
                      {collection.configId && !collection.useDefault ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="reset" />
                          <input
                            type="hidden"
                            name="configId"
                            value={collection.configId}
                          />
                          <s-button type="submit" variant="tertiary">
                            Reset
                          </s-button>
                        </Form>
                      ) : null}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}

        {hasNextPage && endCursor ? (
          <Form method="get">
            {query ? <input type="hidden" name="q" value={query} /> : null}
            <input type="hidden" name="after" value={endCursor} />
            <s-button type="submit" variant="secondary">
              Load more collections
            </s-button>
          </Form>
        ) : null}

        {searchParams.get("after") ? (
          <s-button variant="tertiary" href="/app/collections">
            Back to start
          </s-button>
        ) : null}
      </s-section>

      <s-section slot="aside" heading="How this works">
        <s-paragraph>
          Collections use your default filter set until you give them a custom one.
          Unconfigured and newly created collections always fall back to the
          default, so nothing breaks when your catalogue changes.
        </s-paragraph>
        <s-divider />
        <s-text color="subdued">Custom configurations</s-text>
        <s-text>
          {configuredCount}
          {limit === null ? " / Unlimited" : ` / ${limit}`}
        </s-text>
        <s-text color="subdued">{planName} plan</s-text>
      </s-section>
    </s-page>
  );
}
