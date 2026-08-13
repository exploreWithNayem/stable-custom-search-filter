/** Setup guide, block placement and troubleshooting (CLAUDE.md §13.5). */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { countFilters } from "../models/filter.server";

const BLOCKS = [
  {
    name: "Stable Filter & Search",
    kind: "App embed",
    where: "Theme editor → App embeds",
    what: "Loads the script and styles once per page. Turn this on first.",
  },
  {
    name: "Products & filter",
    kind: "App block",
    where: "Collection or search template, where the product grid should go",
    what: "Everything else: the search field, the filters, the toolbar, active filter chips, the product grid and pagination — in one block.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const filterCount = await countFilters(shop.id, { enabledOnly: true });

  return {
    shopDomain: shop.domain,
    filterCount,
    planName: plan.name,
  };
};

export default function Help() {
  const { shopDomain, filterCount, planName } = useLoaderData<typeof loader>();
  const themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor`;

  return (
    <s-page heading="Help">
      <s-section heading="Setup in three steps">
        <s-ordered-list>
          <s-list-item>
            <strong>Create filters.</strong> Start with Colour, Size, Price and
            Availability — they cover most stores.{" "}
            <s-link href="/app/filters/new">Create a filter</s-link>
            {filterCount > 0 ? (
              <s-badge tone="success">
                {filterCount} active
              </s-badge>
            ) : (
              <s-badge tone="warning">none yet</s-badge>
            )}
          </s-list-item>
          <s-list-item>
            <strong>Enable the app embed.</strong> In the theme editor, open{" "}
            <em>App embeds</em> and turn on{" "}
            <strong>Stable Filter &amp; Search</strong>. This loads the script once
            per page.
          </s-list-item>
          <s-list-item>
            <strong>Add the block.</strong> On your collection template, add{" "}
            <strong>Products &amp; filter</strong>. One block carries the search
            field, the filters, the toolbar and the product grid — there is
            nothing else to place.
          </s-list-item>
        </s-ordered-list>

        <s-button href={themeEditorUrl} target="_blank" variant="primary">
          Open theme editor
        </s-button>
      </s-section>

      <s-section heading="What to add, and where">
        <s-table>
          <s-table-header-row>
            <s-table-header>Name</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header>Where to add it</s-table-header>
            <s-table-header>What it does</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {BLOCKS.map((block) => (
              <s-table-row key={block.name}>
                <s-table-cell>
                  <strong>{block.name}</strong>
                </s-table-cell>
                <s-table-cell>{block.kind}</s-table-cell>
                <s-table-cell>{block.where}</s-table-cell>
                <s-table-cell>{block.what}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Theme compatibility">
        <s-paragraph>
          App blocks need an Online Store 2.0 theme with sections that accept app
          blocks. Most themes released since 2021 qualify, including Dawn.
        </s-paragraph>
        <s-paragraph>
          <strong>If you cannot find a place to add the block:</strong> your
          collection section may not support app blocks. Two options — switch to a
          section that does (in Dawn, the main collection section), or add the app
          embed only and let the app enhance your theme&apos;s own filter form.
        </s-paragraph>
      </s-section>

      <s-section heading="Troubleshooting">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Filters show no values</s-heading>
            <s-paragraph>
              Values come from Shopify. For product options, tags, vendor, type,
              price and availability this works out of the box. For{" "}
              <strong>metafields</strong>, the metafield must be enabled as a filter
              in Shopify&apos;s <em>Search &amp; Discovery</em> app — otherwise
              Shopify returns no values and the filter renders empty.
            </s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>The product count is missing</s-heading>
            <s-paragraph>
              On collection pages Shopify&apos;s API does not always return a total
              for a filtered set. When it cannot be determined exactly, the app shows
              the number loaded rather than guessing. Search pages always show an
              exact total.
            </s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Filtering reloads the page instead of updating in place</s-heading>
            <s-paragraph>
              The <strong>Products &amp; filter</strong> block updates in place, so
              a reload means your theme&apos;s own product section is still on the
              template and handling the filter links. Remove that section — the
              block replaces it, including the grid and pagination.
            </s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Analytics are not recording</s-heading>
            <s-paragraph>
              Check that tracking is on in Settings, and that you are within your
              monthly usage. Over the limit, recording pauses but filtering and search
              keep working. You are on the {planName} plan.
            </s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Contact">
        <s-paragraph>
          Something not covered here? Send us the shop domain and the collection URL
          you are seeing the problem on, and we will take a look.
        </s-paragraph>
        <s-paragraph>
          <s-link href="mailto:support@example.com">support@example.com</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
