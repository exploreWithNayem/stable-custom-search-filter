/**
 * Filter builder form (CLAUDE.md §35, §13.3).
 *
 * Shared by the create and edit routes so the two can never drift. Validation
 * is server-side (zod); this component only renders the errors it is handed.
 */

import { useState } from "react";
import { Form } from "react-router";
import {
  FILTER_DISPLAY_LABELS,
  FILTER_SOURCES,
  FILTER_SOURCE_DEFINITIONS,
  VALUE_SORTS,
  isFilterSource,
  type FilterDisplayType,
  type FilterSource,
} from "../../config/filter-types";

export interface FilterFormValues {
  id?: string;
  name: string;
  source: string;
  sourceKey: string | null;
  displayType: string;
  groupId: string | null;
  enabled: boolean;
  multiSelect: boolean;
  showCount: boolean;
  hideEmpty: boolean;
  collapsedByDefault: boolean;
  searchableValues: boolean;
  maxVisibleValues: number;
  valueSort: string;
}

export interface SourceKeyOption {
  value: string;
  label: string;
  /** Shown as a warning when the option may not work as a storefront filter. */
  caution?: string | null;
}

export interface FilterFormProps {
  values: FilterFormValues;
  errors: Record<string, string>;
  groups: { id: string; name: string }[];
  optionNames: string[];
  productMetafields: SourceKeyOption[];
  variantMetafields: SourceKeyOption[];
  submitLabel: string;
  /** Sources the current plan cannot use, with the reason. */
  lockedSources?: Partial<Record<FilterSource, string>>;
}

/**
 * Boolean form field. The hidden "false" input means an unchecked box still
 * submits a value — otherwise unchecking could never be saved.
 */
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

export function FilterForm({
  values,
  errors,
  groups,
  optionNames,
  productMetafields,
  variantMetafields,
  submitLabel,
  lockedSources = {},
}: FilterFormProps) {
  const [source, setSource] = useState(values.source);
  const [displayType, setDisplayType] = useState(values.displayType);
  const [sourceKey, setSourceKey] = useState(values.sourceKey ?? "");

  const definition = isFilterSource(source)
    ? FILTER_SOURCE_DEFINITIONS[source]
    : null;

  const allowedDisplayTypes: readonly FilterDisplayType[] =
    definition?.allowedDisplayTypes ?? [];

  // Keep the display type valid whenever the source changes.
  const effectiveDisplayType = allowedDisplayTypes.includes(
    displayType as FilterDisplayType,
  )
    ? displayType
    : (definition?.defaultDisplayType ?? displayType);

  const sourceKeyOptions: SourceKeyOption[] =
    source === "product_option" || source === "variant_option"
      ? optionNames.map((name) => ({ value: name, label: name }))
      : source === "product_metafield" || source === "rating"
        ? productMetafields
        : source === "variant_metafield"
          ? variantMetafields
          : [];

  const selectedOption = sourceKeyOptions.find(
    (option) => option.value === sourceKey,
  );

  const isRange = ["range", "range_slider", "rating"].includes(
    effectiveDisplayType,
  );

  return (
    <Form method="post">
      <s-stack direction="block" gap="large-100">
        <s-section heading="Filter">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Filter name"
              details="Shown to shoppers as the section heading."
              value={values.name}
              error={errors.name}
              required
            />

            <s-select
              name="source"
              label="Data source"
              value={source}
              error={errors.source}
              details={definition?.helpText}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setSource(next);
                setSourceKey("");
                if (isFilterSource(next)) {
                  setDisplayType(FILTER_SOURCE_DEFINITIONS[next].defaultDisplayType);
                }
              }}
            >
              {FILTER_SOURCES.map((candidate) => {
                const locked = lockedSources[candidate];
                return (
                  <s-option
                    key={candidate}
                    value={candidate}
                    disabled={Boolean(locked) || undefined}
                  >
                    {FILTER_SOURCE_DEFINITIONS[candidate].label}
                    {locked ? ` — ${locked}` : ""}
                  </s-option>
                );
              })}
            </s-select>

            {definition?.requiresSourceKey ? (
              sourceKeyOptions.length > 0 ? (
                <s-select
                  name="sourceKey"
                  label={definition.sourceKeyLabel ?? "Source"}
                  value={sourceKey}
                  error={errors.sourceKey}
                  onChange={(event) =>
                    setSourceKey(event.currentTarget.value)
                  }
                >
                  <s-option value="">Choose…</s-option>
                  {sourceKeyOptions.map((option) => (
                    <s-option key={option.value} value={option.value}>
                      {option.label}
                    </s-option>
                  ))}
                </s-select>
              ) : (
                <s-text-field
                  name="sourceKey"
                  label={definition.sourceKeyLabel ?? "Source"}
                  details="No options were found automatically — enter the value manually."
                  value={sourceKey}
                  error={errors.sourceKey}
                  onChange={(event) =>
                    setSourceKey(event.currentTarget.value)
                  }
                />
              )
            ) : null}

            {selectedOption?.caution ? (
              <s-banner tone="warning" heading="May not filter on the storefront">
                <s-paragraph>{selectedOption.caution}</s-paragraph>
              </s-banner>
            ) : null}

            {definition?.nativeFilterable === false ? (
              <s-banner tone="info" heading="Requires the app filtering engine">
                <s-paragraph>
                  Shopify&apos;s native filtering cannot express this source, so
                  collections using it will run on the app engine. Everything still
                  works — it just uses an app request per filter change.
                </s-paragraph>
              </s-banner>
            ) : null}

            <s-select
              name="displayType"
              label="Display type"
              value={effectiveDisplayType}
              error={errors.displayType}
              onChange={(event) =>
                setDisplayType(event.currentTarget.value)
              }
            >
              {allowedDisplayTypes.map((candidate) => (
                <s-option key={candidate} value={candidate}>
                  {FILTER_DISPLAY_LABELS[candidate]}
                </s-option>
              ))}
            </s-select>

            <s-select name="groupId" label="Group" value={values.groupId ?? ""}>
              <s-option value="">No group</s-option>
              {groups.map((group) => (
                <s-option key={group.id} value={group.id}>
                  {group.name}
                </s-option>
              ))}
            </s-select>
          </s-stack>
        </s-section>

        <s-section heading="Behaviour">
          <s-stack direction="block" gap="base">
            <BooleanField
              name="enabled"
              label="Enabled"
              details="Disabled filters stay configured but do not appear on the storefront."
              checked={values.enabled}
            />
            <BooleanField
              name="showCount"
              label="Show product count"
              checked={values.showCount}
            />
            <BooleanField
              name="hideEmpty"
              label="Hide values with no products"
              checked={values.hideEmpty}
            />

            {!isRange ? (
              <>
                <BooleanField
                  name="multiSelect"
                  label="Allow multiple selections"
                  details="Off behaves like a radio group."
                  checked={values.multiSelect}
                />
                <BooleanField
                  name="searchableValues"
                  label="Add a search box to this filter"
                  details="Useful for long lists such as brands or sizes."
                  checked={values.searchableValues}
                />
                <s-number-field
                  name="maxVisibleValues"
                  label="Values shown before “Show more”"
                  value={String(values.maxVisibleValues)}
                  min={1}
                  max={100}
                  error={errors.maxVisibleValues}
                />
                <s-select name="valueSort" label="Value order" value={values.valueSort}>
                  {VALUE_SORTS.map((sort) => (
                    <s-option key={sort} value={sort}>
                      {sort === "count"
                        ? "Most products first"
                        : sort === "alpha"
                          ? "Alphabetical"
                          : "Manual order"}
                    </s-option>
                  ))}
                </s-select>
              </>
            ) : (
              // Range filters have a single control, so multi-select, value
              // search and value ordering do not apply — but the fields must
              // still submit or the saved record would lose them.
              <>
                <input type="hidden" name="multiSelect" value="false" />
                <input type="hidden" name="searchableValues" value="false" />
                <input
                  type="hidden"
                  name="maxVisibleValues"
                  value={String(values.maxVisibleValues)}
                />
                <input type="hidden" name="valueSort" value={values.valueSort} />
              </>
            )}

            <BooleanField
              name="collapsedByDefault"
              label="Collapsed by default"
              checked={values.collapsedByDefault}
            />
          </s-stack>
        </s-section>

        {errors._form ? (
          <s-banner tone="critical" heading="Could not save">
            <s-paragraph>{errors._form}</s-paragraph>
          </s-banner>
        ) : null}

        <s-stack direction="inline" gap="base">
          <s-button type="submit" variant="primary">
            {submitLabel}
          </s-button>
          <s-button href="/app/filters" variant="tertiary">
            Cancel
          </s-button>
        </s-stack>
      </s-stack>
    </Form>
  );
}
