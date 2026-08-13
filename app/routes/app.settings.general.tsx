/** Storefront behaviour settings (CLAUDE.md §13.5, Phase 16). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import { getSettings, patchGeneralSettings } from "../models/settings.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  formToObject,
  generalSettingsSchema,
  parseInput,
} from "../lib/validation";
import { PER_PAGE_OPTIONS } from "../lib/filter-url";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const settings = await getSettings(shop.id);
  return { general: settings.general };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireAdminContext(request);
  const formData = await request.formData();
  const raw = formToObject(formData);

  for (const key of ["defaultPerPage", "columns"]) {
    if (typeof raw[key] === "string") raw[key] = Number(raw[key]);
  }

  // This page owns four fields; the rest of the blob is merged in unchanged.
  const current = await getSettings(shop.id);
  const parsed = parseInput(generalSettingsSchema, { ...current.general, ...raw });
  if (!parsed.ok) return { errors: parsed.errors };

  await patchGeneralSettings(shop.id, parsed.data);

  await recordActivity({
    shopId: shop.id,
    action: "settings.updated",
    summary: "Updated storefront behaviour settings",
  });
  invalidateShop(shop.domain);

  return { ok: true };
};

export default function GeneralSettings() {
  const { general } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? {};

  return (
    <s-page heading="Storefront behaviour">
      <s-button slot="back-action" href="/app/settings">
        Settings
      </s-button>

      {actionData?.ok ? <s-banner tone="success" heading="Saved" /> : null}

      <Form method="post">
        <s-section heading="Filtering">
          <s-stack direction="block" gap="base">
            {/*
              No engine picker: the Products & filter block is the collection
              page's product listing, so the app renders the results wherever
              it is placed. Offering a "let the theme render them" choice that
              the block makes impossible would be a control that does nothing.
            */}
            <s-banner tone="info" heading="How filtering works">
              <s-paragraph>
                The <strong>Products &amp; filter</strong> block renders the
                products, so filtering, sorting and paging update in place without
                a page reload. Results are fetched by the app over a signed proxy
                request — your storefront never talks to Shopify&apos;s APIs
                directly.
              </s-paragraph>
            </s-banner>

            <s-select
              name="defaultPerPage"
              label="Products per page"
              value={String(general.defaultPerPage)}
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <s-option key={option} value={String(option)}>
                  {option}
                </s-option>
              ))}
            </s-select>

            <s-number-field
              name="columns"
              label="Grid columns on desktop"
              value={String(general.columns)}
              min={2}
              max={5}
              error={errors.columns}
            />

            <s-select
              name="paginationStyle"
              label="Pagination"
              value={general.paginationStyle}
            >
              <s-option value="numbered">Numbered pages</s-option>
              <s-option value="load_more">Load more button</s-option>
            </s-select>

            <s-button type="submit" variant="primary">
              Save
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <s-section slot="aside" heading="Layout">
        <s-paragraph>
          How the filters are arranged — sidebar, off canvas or across the top —
          is set separately.
        </s-paragraph>
        <s-button href="/app/filters/layout" variant="secondary">
          Filter layout
        </s-button>
      </s-section>
    </s-page>
  );
}
