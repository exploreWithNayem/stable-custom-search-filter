/**
 * Settings hub (CLAUDE.md §13.5, Phase 16).
 *
 * A directory rather than a form: every card leads to the page that actually
 * owns that setting, so there is one place to change a thing and one place to
 * look for it. Cards point at real pages only — nothing here is a placeholder.
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { getSettings } from "../models/settings.server";
import { DESKTOP_LAYOUT_DEFINITIONS } from "../config/layouts";
import { CardGrid } from "../components/admin/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);

  const layout = DESKTOP_LAYOUT_DEFINITIONS.find(
    (definition) => definition.value === settings.general.defaultLayout,
  );

  return {
    planName: plan.name,
    perPage: settings.general.defaultPerPage,
    layoutLabel: layout?.label ?? settings.general.defaultLayout,
    trackingOn:
      settings.analytics.trackSearches || settings.analytics.trackFilters,
  };
};

/** The icon set is Polaris's own, so take the type from the component. */
type IconType = NonNullable<
  React.ComponentProps<"s-icon">["type"]
>;

function SettingCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: IconType;
  title: string;
  description: string;
}) {
  return (
    <s-clickable href={href} padding="base" borderRadius="base">
      <s-stack direction="inline" gap="small-300" alignItems="start">
        <s-icon type={icon} />
        <s-stack direction="block" gap="small-500">
          <s-text type="strong">{title}</s-text>
          <s-text color="subdued">{description}</s-text>
        </s-stack>
      </s-stack>
    </s-clickable>
  );
}

export default function SettingsIndex() {
  const { planName, perPage, layoutLabel, trackingOn } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-section>
        <CardGrid minColumnWidth={240}>
          <SettingCard
            href="/app/settings/general"
            icon="settings"
            title="Storefront behaviour"
            description={`Products per page, grid columns and pagination. Currently ${perPage} per page.`}
          />
          <SettingCard
            href="/app/settings/appearance"
            icon="color"
            title="Appearance"
            description="Accent colour, corner radius, swatch size and custom CSS."
          />
          <SettingCard
            href="/app/settings/analytics"
            icon="chart-vertical"
            title="Analytics and data"
            description={`Tracking, retention and clearing old events. Tracking is ${trackingOn ? "on" : "off"}.`}
          />

          <SettingCard
            href="/app/filters/layout"
            icon="layout-columns-2"
            title="Filter layout"
            description={`How filters are arranged on desktop and mobile. Currently ${layoutLabel}.`}
          />
          <SettingCard
            href="/app/filters"
            icon="filter"
            title="Filter tree"
            description="The filter options shoppers see, their order, values and swatches."
          />
          <SettingCard
            href="/app/collections"
            icon="collection"
            title="Collection filter trees"
            description="Give individual collections their own set of filters."
          />

          <SettingCard
            href="/app/search"
            icon="search"
            title="Search"
            description="Placeholder, suggestions, synonyms and redirects."
          />
          <SettingCard
            href="/app/pricing"
            icon="credit-card"
            title="Subscription"
            description={`View and manage your plan. You are on ${planName}.`}
          />
          <SettingCard
            href="/app/help"
            icon="question-circle"
            title="Setup and help"
            description="Where to add the theme block, theme compatibility and troubleshooting."
          />
        </CardGrid>
      </s-section>

      <s-section slot="aside" heading="Setting precedence">
        <s-paragraph>Settings resolve in this order:</s-paragraph>
        <s-ordered-list>
          <s-list-item>Theme block setting</s-list-item>
          <s-list-item>Collection configuration</s-list-item>
          <s-list-item>These shop settings</s-list-item>
          <s-list-item>App defaults</s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}
