/**
 * Filter option builder (CLAUDE.md §35, §13.3).
 *
 * Shared by the create and edit routes so the two can never drift. General
 * settings, advanced behaviour and a live preview, mirroring the "add filter
 * option" flow merchants expect from this category of app.
 *
 * Validation is server-side (zod); this component only renders the errors it
 * is handed. It reads its own live values from the form element rather than
 * from `onChange` props: Polaris controls are custom elements, and React 18
 * writes JSX event props onto them as attributes, where they never fire.
 */

import { useRef, useState } from "react";
import { Form } from "react-router";
import {
  FILTER_DISPLAY_LABELS,
  FILTER_SOURCE_DEFINITIONS,
  VALUE_SORTS,
  groupedFilterSources,
  isFilterDisplayType,
  isFilterSource,
  type FilterDisplayType,
  type FilterSource,
} from "../../config/filter-types";
import { FilterPreview } from "./FilterPreview";
import { Tabs, useFormValues } from "./ui";

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

const TABS = [
  { id: "general", label: "General" },
  { id: "advanced", label: "Advanced" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
  const formRef = useRef<HTMLFormElement>(null);
  const live = useFormValues(formRef);
  const [tab, setTab] = useState<TabId>("general");

  const source = live.source ?? values.source;
  const sourceKey = live.sourceKey ?? values.sourceKey ?? "";
  const name = live.name ?? values.name;

  const definition = isFilterSource(source)
    ? FILTER_SOURCE_DEFINITIONS[source]
    : null;

  const allowedDisplayTypes: readonly FilterDisplayType[] =
    definition?.allowedDisplayTypes ?? [];

  // The display type select is remounted whenever the source changes (see the
  // `key` below), so its live value can lag by one render — fall back to the
  // source's default rather than showing a type this source cannot use.
  const candidate = live.displayType ?? values.displayType;
  const effectiveDisplayType = allowedDisplayTypes.includes(
    candidate as FilterDisplayType,
  )
    ? candidate
    : (definition?.defaultDisplayType ?? candidate);

  const sourceKeyOptions: SourceKeyOption[] =
    source === "product_option" || source === "variant_option"
      ? optionNames.map((option) => ({ value: option, label: option }))
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

  // A fragment, not a wrapper: `slot="aside"` only projects when the section
  // is a direct child of `s-page`, and fragments add no DOM node.
  return (
    <>
      <Form method="post" ref={formRef}>
        <s-section heading={values.id ? "Filter option" : "Add filter option"}>
          <Tabs tabs={TABS} selected={tab} onSelect={setTab} />

          <div
            id="panel-general"
            role="tabpanel"
            aria-labelledby="tab-general"
            hidden={tab !== "general"}
          >
            <s-stack direction="block" gap="base">
              <s-select
                name="source"
                label="Option type"
                value={source}
                error={errors.source}
                details={definition?.helpText}
              >
                {groupedFilterSources().map((group) => (
                  <s-option-group key={group.id} label={group.label}>
                    {group.sources.map((entry) => {
                      const locked = lockedSources[entry.source];
                      return (
                        <s-option
                          key={entry.source}
                          value={entry.source}
                          disabled={Boolean(locked) || undefined}
                        >
                          {entry.label}
                          {locked ? ` — ${locked}` : ""}
                        </s-option>
                      );
                    })}
                  </s-option-group>
                ))}
              </s-select>

              <s-text-field
                name="name"
                label="Option label"
                details="Shown to shoppers as the heading of this filter."
                value={values.name}
                error={errors.name}
                required
              />

              {definition?.requiresSourceKey ? (
                sourceKeyOptions.length > 0 ? (
                  <s-select
                    key={`source-key-${source}`}
                    name="sourceKey"
                    label={definition.sourceKeyLabel ?? "Source"}
                    value={sourceKey}
                    error={errors.sourceKey}
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
                    key={`source-key-${source}`}
                    name="sourceKey"
                    label={definition.sourceKeyLabel ?? "Source"}
                    details="No options were found automatically — enter the value manually."
                    value={sourceKey}
                    error={errors.sourceKey}
                  />
                )
              ) : null}

              {selectedOption?.caution ? (
                <s-banner
                  tone="warning"
                  heading="May not filter on the storefront"
                >
                  <s-paragraph>{selectedOption.caution}</s-paragraph>
                </s-banner>
              ) : null}

              {definition?.nativeFilterable === false ? (
                <s-banner
                  tone="info"
                  heading="Requires the app filtering engine"
                >
                  <s-paragraph>
                    Shopify&apos;s native filtering cannot express this source,
                    so collections using it will run on the app engine.
                    Everything still works — it just uses an app request per
                    filter change.
                  </s-paragraph>
                </s-banner>
              ) : null}

              <s-select
                key={`display-type-${source}`}
                name="displayType"
                label="Display type"
                value={effectiveDisplayType}
                error={errors.displayType}
              >
                {allowedDisplayTypes.map((entry) => (
                  <s-option key={entry} value={entry}>
                    {FILTER_DISPLAY_LABELS[entry]}
                  </s-option>
                ))}
              </s-select>

              <s-select
                name="groupId"
                label="Group"
                value={values.groupId ?? ""}
              >
                <s-option value="">No group</s-option>
                {groups.map((group) => (
                  <s-option key={group.id} value={group.id}>
                    {group.name}
                  </s-option>
                ))}
              </s-select>
            </s-stack>
          </div>

          <div
            id="panel-advanced"
            role="tabpanel"
            aria-labelledby="tab-advanced"
            hidden={tab !== "advanced"}
          >
            <s-stack direction="block" gap="base">
              <BooleanField
                name="enabled"
                label="Enabled"
                details="Disabled options stay configured but do not appear on the storefront."
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
                    label="Add a search box to this option"
                    details="Useful for long lists such as brands or sizes."
                    checked={values.searchableValues}
                  />
                  <s-number-field
                    name="maxVisibleValues"
                    label="Values shown before the list scrolls"
                    value={String(values.maxVisibleValues)}
                    min={1}
                    max={100}
                    error={errors.maxVisibleValues}
                  />
                  <s-select
                    name="valueSort"
                    label="Value order"
                    value={values.valueSort}
                  >
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
                // Range options have a single control, so multi-select, value
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
                  <input
                    type="hidden"
                    name="valueSort"
                    value={values.valueSort}
                  />
                </>
              )}

              <BooleanField
                name="collapsedByDefault"
                label="Collapsed by default"
                checked={values.collapsedByDefault}
              />
            </s-stack>
          </div>

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
        </s-section>
      </Form>

      <s-section slot="aside" heading="Preview">
        <FilterPreview
          label={name}
          displayType={
            isFilterDisplayType(effectiveDisplayType)
              ? effectiveDisplayType
              : "checkbox"
          }
        />
      </s-section>
    </>
  );
}
