/**
 * Filter layout picker (CLAUDE.md §10.1, §12.2, Phase 16).
 *
 * The layout is a shop-level decision rather than a per-theme one, so it lives
 * here and reaches the storefront through the proxy config. A theme block can
 * still override it for one template.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { getSettings, patchGeneralSettings } from "../models/settings.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  LAYOUTS,
  MOBILE_LAYOUTS,
  formToObject,
  generalSettingsSchema,
  parseInput,
} from "../lib/validation";
import {
  DESKTOP_LAYOUT_DEFINITIONS,
  MOBILE_LAYOUT_DEFINITIONS,
} from "../config/layouts";
import {
  DesktopLayoutThumb,
  MobileLayoutThumb,
} from "../components/admin/LayoutThumb";
import { CardGrid } from "../components/admin/ui";

const TABS = [
  { id: "desktop", label: "Desktop layout" },
  { id: "mobile", label: "Mobile layout" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);
  return { general: settings.general };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "desktop") {
    const value = String(formData.get("defaultLayout") ?? "");
    if (!(LAYOUTS as readonly string[]).includes(value)) {
      return { errors: { defaultLayout: "Unknown layout" } };
    }
    await patchGeneralSettings(shop.id, {
      defaultLayout: value as (typeof LAYOUTS)[number],
    });
  } else if (intent === "mobile") {
    const value = String(formData.get("mobileLayout") ?? "");
    if (!(MOBILE_LAYOUTS as readonly string[]).includes(value)) {
      return { errors: { mobileLayout: "Unknown layout" } };
    }
    await patchGeneralSettings(shop.id, {
      mobileLayout: value as (typeof MOBILE_LAYOUTS)[number],
    });
  } else if (intent === "settings") {
    const raw = formToObject(formData);
    // Only the display toggles live on this tab; everything else is merged in.
    const current = await getSettings(shop.id);
    const parsed = parseInput(generalSettingsSchema, {
      ...current.general,
      ...raw,
    });
    if (!parsed.ok) return { errors: parsed.errors };

    await patchGeneralSettings(shop.id, parsed.data);
  } else {
    return { errors: { _form: "Unknown action" } };
  }

  await recordActivity({
    shopId: shop.id,
    action: "settings.layout_updated",
    summary: `Updated the ${intent} filter layout`,
  });
  invalidateShop(shop.domain);

  return { ok: true };
};

function BooleanField({
  name,
  label,
  checked,
  details,
}: {
  name: string;
  label: string;
  checked: boolean;
  details?: string;
}) {
  return (
    <>
      <input type="hidden" name={name} value="false" />
      <s-checkbox
        name={name}
        value="true"
        label={label}
        details={details}
        checked={checked || undefined}
      />
    </>
  );
}

/**
 * A radio rendered as a preview card. A real `<input type="radio">` does the
 * work so the group stays keyboard operable and submits with the form; the
 * card is only its label.
 */
function LayoutCard({
  name,
  value,
  label,
  description,
  checked,
  children,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        cursor: "pointer",
        height: "100%",
      }}
    >
      <s-box
        padding="base"
        borderWidth="base"
        borderRadius="base"
        background={checked ? "subdued" : undefined}
      >
        <s-stack direction="block" gap="small-300">
          {children}
          {/*
            The name sits in a plain span rather than `s-text` so it is the
            label element's own accessible text — a custom element's content
            is not guaranteed to be exposed as such.
          */}
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={checked}
              aria-describedby={`${name}-${value}-description`}
            />
            <span style={{ fontWeight: 600 }}>{label}</span>
          </s-stack>
          <s-text color="subdued" id={`${name}-${value}-description`}>
            {description}
          </s-text>
        </s-stack>
      </s-box>
    </label>
  );
}

export default function FilterLayout() {
  const { general } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const requested = params.get("tab");
  const tab: TabId = TABS.some((entry) => entry.id === requested)
    ? (requested as TabId)
    : "desktop";

  return (
    <s-page heading="Filter layout">
      <s-section>
        <s-banner heading="Filter layout guide">
          <s-paragraph>
            Choose one of the options below to change how filters are laid out
            on your storefront. The block you added to your collection template
            can override this for a single template.
          </s-paragraph>
          <s-button href="/app/help" variant="secondary">
            Support article
          </s-button>
        </s-banner>
      </s-section>

      <s-section>
        {/*
          Tabs are links rather than buttons with handlers: Polaris web
          components are custom elements and React 18 cannot bind their events
          through JSX. Links also make each tab shareable and back-navigable.
        */}
        <s-stack direction="inline" gap="small-300">
          {TABS.map((entry) => (
            <s-button
              key={entry.id}
              href={`/app/filters/layout?tab=${entry.id}`}
              variant={tab === entry.id ? "primary" : "tertiary"}
            >
              {entry.label}
            </s-button>
          ))}
        </s-stack>
      </s-section>

      {tab === "desktop" ? (
        <Form method="post">
          <input type="hidden" name="intent" value="desktop" />
          <s-section heading="Desktop layout">
            <CardGrid minColumnWidth={200}>
              {DESKTOP_LAYOUT_DEFINITIONS.map((definition) => (
                <LayoutCard
                  key={definition.value}
                  name="defaultLayout"
                  value={definition.value}
                  label={definition.label}
                  description={definition.description}
                  checked={general.defaultLayout === definition.value}
                >
                  <DesktopLayoutThumb layout={definition.value} />
                </LayoutCard>
              ))}
            </CardGrid>

            <s-button
              type="submit"
              variant="primary"
              disabled={busy || undefined}
            >
              Save desktop layout
            </s-button>
          </s-section>
        </Form>
      ) : null}

      {tab === "mobile" ? (
        <Form method="post">
          <input type="hidden" name="intent" value="mobile" />
          <s-section heading="Mobile layout">
            <CardGrid minColumnWidth={200}>
              {MOBILE_LAYOUT_DEFINITIONS.map((definition) => (
                <LayoutCard
                  key={definition.value}
                  name="mobileLayout"
                  value={definition.value}
                  label={definition.label}
                  description={definition.description}
                  checked={general.mobileLayout === definition.value}
                >
                  <MobileLayoutThumb layout={definition.value} />
                </LayoutCard>
              ))}
            </CardGrid>

            <s-button
              type="submit"
              variant="primary"
              disabled={busy || undefined}
            >
              Save mobile layout
            </s-button>
          </s-section>
        </Form>
      ) : null}

      {tab === "settings" ? (
        <Form method="post">
          <input type="hidden" name="intent" value="settings" />
          <s-section heading="Display">
            <s-stack direction="block" gap="base">
              <BooleanField
                name="showProductCount"
                label="Show the product count"
                checked={general.showProductCount}
              />
              <BooleanField
                name="showClearAll"
                label="Show the clear all button"
                checked={general.showClearAll}
              />
              <BooleanField
                name="showActiveFilters"
                label="Show active filter chips"
                checked={general.showActiveFilters}
              />
              <BooleanField
                name="showSort"
                label="Show the sort control"
                checked={general.showSort}
              />
              <BooleanField
                name="showPerPage"
                label="Show the products-per-page control"
                checked={general.showPerPage}
              />
              <BooleanField
                name="mobileDrawer"
                label="Use a filter drawer on mobile"
                details="Turn this off to keep filters in the page on small screens."
                checked={general.mobileDrawer}
              />

              <s-button
                type="submit"
                variant="primary"
                disabled={busy || undefined}
              >
                Save settings
              </s-button>
            </s-stack>
          </s-section>
        </Form>
      ) : null}

      <s-section slot="aside" heading="Where this applies">
        <s-paragraph>
          This is the shop default. A collection with its own configuration, or
          a theme block with its layout set explicitly, takes precedence.
        </s-paragraph>
        <s-button href="/app/collections" variant="secondary">
          Collection filters
        </s-button>
      </s-section>
    </s-page>
  );
}
