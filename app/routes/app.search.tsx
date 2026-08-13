/** Search configuration, synonyms and suggestions (CLAUDE.md §9/§30/§31, Phase 11). */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useSearchParams } from "react-router";
import { requireAdminContext } from "../services/shop/context.server";
import {
  deleteSuggestion,
  deleteSynonym,
  getSearchConfig,
  listSuggestions,
  listSynonyms,
  updateSearchConfig,
  upsertSuggestion,
  upsertSynonym,
} from "../models/search.server";
import { recordActivity } from "../models/activity.server";
import { invalidateShop } from "../lib/cache.server";
import {
  SUGGESTION_KINDS,
  formToObject,
  parseInput,
  searchConfigInputSchema,
  suggestionInputSchema,
  synonymInputSchema,
} from "../lib/validation";
import { planAllows } from "../config/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);

  const [config, synonyms, suggestions] = await Promise.all([
    getSearchConfig(shop.id),
    listSynonyms(shop.id),
    listSuggestions(shop.id),
  ]);

  return {
    plan: { name: plan.name },
    can: {
      synonyms: planAllows(plan.key, "synonyms"),
      suggestions: planAllows(plan.key, "suggestions"),
      predictivePlus: planAllows(plan.key, "predictiveSearchPlus"),
    },
    config: {
      enabled: config.enabled,
      placeholder: config.placeholder,
      minChars: config.minChars,
      debounceMs: config.debounceMs,
      maxSuggestions: config.maxSuggestions,
      showImages: config.showImages,
      showPrices: config.showPrices,
      showVendors: config.showVendors,
      showProductTypes: config.showProductTypes,
      showCollections: config.showCollections,
      showViewAll: config.showViewAll,
      noResultsText: config.noResultsText,
    },
    synonyms,
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      term: suggestion.term,
      kind: suggestion.kind,
      targetUrl: suggestion.targetUrl,
      enabled: suggestion.enabled,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, plan } = await requireAdminContext(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "config");

  if (intent === "config") {
    const raw = formToObject(formData);
    for (const key of ["minChars", "debounceMs", "maxSuggestions"]) {
      if (typeof raw[key] === "string") raw[key] = Number(raw[key]);
    }

    const parsed = parseInput(searchConfigInputSchema, raw);
    if (!parsed.ok) return { errors: parsed.errors, scope: "config" as const };

    await updateSearchConfig(shop.id, parsed.data);
    await recordActivity({
      shopId: shop.id,
      action: "search.config_updated",
      summary: "Updated search settings",
    });
    invalidateShop(shop.domain);
    return { ok: true, scope: "config" as const };
  }

  if (intent === "synonym") {
    if (!planAllows(plan.key, "synonyms")) {
      return {
        errors: { _form: "Synonyms require the Pro plan." },
        scope: "synonym" as const,
      };
    }

    const parsed = parseInput(synonymInputSchema, {
      term: String(formData.get("term") ?? ""),
      // Accept a comma-separated list, which is how merchants think about this.
      synonyms: String(formData.get("synonyms") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      bidirectional: formData.get("bidirectional") === "true",
      enabled: true,
    });

    if (!parsed.ok) return { errors: parsed.errors, scope: "synonym" as const };

    await upsertSynonym(shop.id, parsed.data);
    invalidateShop(shop.domain);
    return { ok: true, scope: "synonym" as const };
  }

  if (intent === "delete-synonym") {
    await deleteSynonym(shop.id, String(formData.get("id") ?? ""));
    invalidateShop(shop.domain);
    return { ok: true, scope: "synonym" as const };
  }

  if (intent === "suggestion") {
    if (!planAllows(plan.key, "suggestions")) {
      return {
        errors: { _form: "Suggestions and redirects require the Pro plan." },
        scope: "suggestion" as const,
      };
    }

    const parsed = parseInput(suggestionInputSchema, {
      term: String(formData.get("term") ?? ""),
      kind: String(formData.get("kind") ?? "custom"),
      targetUrl: String(formData.get("targetUrl") ?? "") || null,
      position: 0,
      enabled: true,
    });

    if (!parsed.ok) return { errors: parsed.errors, scope: "suggestion" as const };

    await upsertSuggestion(shop.id, parsed.data);
    invalidateShop(shop.domain);
    return { ok: true, scope: "suggestion" as const };
  }

  if (intent === "delete-suggestion") {
    await deleteSuggestion(shop.id, String(formData.get("id") ?? ""));
    invalidateShop(shop.domain);
    return { ok: true, scope: "suggestion" as const };
  }

  return { ok: true, scope: "config" as const };
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

export default function SearchSettings() {
  const { config, synonyms, suggestions, can, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  const configErrors = actionData?.scope === "config" ? (actionData.errors ?? {}) : {};
  const synonymErrors = actionData?.scope === "synonym" ? (actionData.errors ?? {}) : {};
  const suggestionErrors =
    actionData?.scope === "suggestion" ? (actionData.errors ?? {}) : {};

  return (
    <s-page heading="Search">
      {actionData?.ok && searchParams.toString() === "" ? (
        <s-banner tone="success" heading="Saved" />
      ) : null}

      <Form method="post">
        <input type="hidden" name="intent" value="config" />
        <s-section heading="Search field">
          <s-stack direction="block" gap="base">
            <BooleanField name="enabled" label="Enable search" checked={config.enabled} />
            <s-text-field
              name="placeholder"
              label="Placeholder"
              value={config.placeholder}
              error={configErrors.placeholder}
            />
            <s-number-field
              name="minChars"
              label="Minimum characters"
              value={String(config.minChars)}
              min={1}
              max={10}
              error={configErrors.minChars}
            />
            <s-number-field
              name="debounceMs"
              label="Debounce delay (ms)"
              details="How long to wait after typing stops before searching."
              value={String(config.debounceMs)}
              min={0}
              max={2000}
              error={configErrors.debounceMs}
            />
            <s-text-field
              name="noResultsText"
              label="No results message"
              value={config.noResultsText}
              error={configErrors.noResultsText}
            />
          </s-stack>
        </s-section>

        <s-section heading="Predictive suggestions">
          <s-stack direction="block" gap="base">
            <s-number-field
              name="maxSuggestions"
              label="Maximum suggestions"
              value={String(config.maxSuggestions)}
              min={1}
              max={20}
              error={configErrors.maxSuggestions}
            />
            <BooleanField name="showImages" label="Show product images" checked={config.showImages} />
            <BooleanField name="showPrices" label="Show prices" checked={config.showPrices} />
            <BooleanField name="showVendors" label="Show vendors" checked={config.showVendors} />
            <BooleanField
              name="showProductTypes"
              label="Show product types"
              checked={config.showProductTypes}
            />
            <BooleanField
              name="showCollections"
              label="Show collections"
              checked={config.showCollections}
            />
            <BooleanField
              name="showViewAll"
              label='Show "View all results"'
              checked={config.showViewAll}
            />

            {!can.predictivePlus ? (
              <s-banner tone="info" heading="Using your theme's native suggestions">
                <s-paragraph>
                  On the {plan.name} plan predictive search runs entirely in the
                  browser against Shopify&apos;s own endpoint — fast, and it never
                  counts against your usage. Upgrade to route it through the app so
                  synonyms, redirects and custom suggestions apply.
                </s-paragraph>
              </s-banner>
            ) : null}
          </s-stack>
        </s-section>

        <s-button type="submit" variant="primary">
          Save search settings
        </s-button>
      </Form>

      <s-section heading="Synonyms">
        {!can.synonyms ? (
          <s-banner tone="info" heading="Synonyms require the Pro plan">
            <s-button href="/app/pricing">View plans</s-button>
          </s-banner>
        ) : null}

        <s-paragraph>
          Expand a shopper&apos;s term to include others, so &ldquo;sneakers&rdquo;
          also matches &ldquo;shoes&rdquo;.
        </s-paragraph>

        {synonyms.length > 0 ? (
          <s-table>
            <s-table-header-row>
              <s-table-header>Term</s-table-header>
              <s-table-header>Synonyms</s-table-header>
              <s-table-header>Direction</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {synonyms.map((synonym) => (
                <s-table-row key={synonym.id}>
                  <s-table-cell>{synonym.term}</s-table-cell>
                  <s-table-cell>{synonym.synonyms.join(", ")}</s-table-cell>
                  <s-table-cell>
                    {synonym.bidirectional ? "Both ways" : "One way"}
                  </s-table-cell>
                  <s-table-cell>
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete-synonym" />
                      <input type="hidden" name="id" value={synonym.id} />
                      <s-button type="submit" variant="tertiary" tone="critical">
                        Delete
                      </s-button>
                    </Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : null}

        <Form method="post">
          <input type="hidden" name="intent" value="synonym" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="term"
              label="Term"
              placeholder="sneakers"
              error={synonymErrors.term}
            />
            <s-text-field
              name="synonyms"
              label="Synonyms"
              details="Comma separated."
              placeholder="shoes, trainers, runners"
              error={synonymErrors.synonyms}
            />
            <input type="hidden" name="bidirectional" value="false" />
            <s-checkbox
              name="bidirectional"
              value="true"
              label="Match in both directions"
              checked
            />
            {synonymErrors._form ? (
              <s-banner tone="critical" heading="Could not save">
                <s-paragraph>{synonymErrors._form}</s-paragraph>
              </s-banner>
            ) : null}
            <s-button type="submit" variant="secondary" disabled={!can.synonyms || undefined}>
              Add synonym
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Suggestions and redirects">
        {!can.suggestions ? (
          <s-banner tone="info" heading="Suggestions require the Pro plan">
            <s-button href="/app/pricing">View plans</s-button>
          </s-banner>
        ) : null}

        {suggestions.length > 0 ? (
          <s-table>
            <s-table-header-row>
              <s-table-header>Term</s-table-header>
              <s-table-header>Kind</s-table-header>
              <s-table-header>Destination</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {suggestions.map((suggestion) => (
                <s-table-row key={suggestion.id}>
                  <s-table-cell>{suggestion.term}</s-table-cell>
                  <s-table-cell>{suggestion.kind}</s-table-cell>
                  <s-table-cell>{suggestion.targetUrl ?? "—"}</s-table-cell>
                  <s-table-cell>
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete-suggestion" />
                      <input type="hidden" name="id" value={suggestion.id} />
                      <s-button type="submit" variant="tertiary" tone="critical">
                        Delete
                      </s-button>
                    </Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : null}

        <Form method="post">
          <input type="hidden" name="intent" value="suggestion" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="term"
              label="Term"
              placeholder="gift card"
              error={suggestionErrors.term}
            />
            <s-select name="kind" label="Kind" value="custom">
              {SUGGESTION_KINDS.map((kind) => (
                <s-option key={kind} value={kind}>
                  {kind === "custom"
                    ? "Custom suggestion"
                    : kind === "redirect"
                      ? "Redirect"
                      : "Featured term"}
                </s-option>
              ))}
            </s-select>
            <s-text-field
              name="targetUrl"
              label="Redirect destination"
              details="Storefront path starting with / — required for redirects."
              placeholder="/pages/gift-cards"
              error={suggestionErrors.targetUrl}
            />
            {suggestionErrors._form ? (
              <s-banner tone="critical" heading="Could not save">
                <s-paragraph>{suggestionErrors._form}</s-paragraph>
              </s-banner>
            ) : null}
            <s-button
              type="submit"
              variant="secondary"
              disabled={!can.suggestions || undefined}
            >
              Add suggestion
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
