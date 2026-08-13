/**
 * Facet merge tests — where Shopify's data meets merchant configuration.
 * Regressions here are invisible on the surface but wrong on the storefront.
 */

import { describe, expect, it } from "vitest";
import type { FilterValue } from "@prisma/client";
import {
  buildActiveChips,
  buildFacets,
} from "../app/services/filters/facets.server";
import type { ResolvedFilter, ResolvedFilterConfig } from "../app/services/filters/resolve.server";
import type { StorefrontFilter } from "../app/services/storefront/product-query.server";
import { parseFilterState } from "../app/lib/filter-url";

function override(partial: Partial<FilterValue> & { value: string }): FilterValue {
  return {
    id: `v-${partial.value}`,
    filterId: "f1",
    value: partial.value,
    label: partial.label ?? null,
    swatchColor: partial.swatchColor ?? null,
    swatchImage: partial.swatchImage ?? null,
    position: partial.position ?? 0,
    hidden: partial.hidden ?? false,
    cachedCount: partial.cachedCount ?? null,
    updatedAt: new Date(),
  };
}

function filter(partial: Partial<ResolvedFilter> = {}): ResolvedFilter {
  return {
    id: "f1",
    handle: "color",
    name: "Colour",
    param: "filter.v.option.color",
    source: "product_option",
    sourceKey: "Color",
    displayType: "checkbox",
    multiSelect: true,
    showCount: true,
    hideEmpty: true,
    collapsedByDefault: false,
    searchableValues: false,
    maxVisibleValues: 8,
    valueSort: "count",
    config: {},
    group: null,
    overrides: new Map(),
    nativeCompatible: true,
    ...partial,
  };
}

function config(filters: ResolvedFilter[]): ResolvedFilterConfig {
  return {
    filters,
    nativeEligible: filters.every((f) => f.nativeCompatible),
    source: "default",
    collectionHandle: null,
    layout: "sidebar",
  };
}

function storefrontFilter(
  id: string,
  values: { label: string; count: number; color?: string }[],
): StorefrontFilter {
  return {
    id,
    label: id,
    type: "LIST",
    values: values.map((value) => ({
      id: `${id}.${value.label}`,
      label: value.label,
      count: value.count,
      input: JSON.stringify({
        variantOption: { name: "color", value: value.label },
      }),
      swatch: value.color ? { color: value.color, image: null } : null,
    })),
  };
}

describe("buildFacets", () => {
  const shopifyValues = storefrontFilter("filter.v.option.color", [
    { label: "Black", count: 12, color: "#000000" },
    { label: "White", count: 5 },
    { label: "Red", count: 0 },
  ]);

  it("matches Shopify's Filter.id against our param key", () => {
    const facets = buildFacets({
      config: config([filter()]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });

    expect(facets).toHaveLength(1);
    expect(facets[0].handle).toBe("color");
    expect(facets[0].values.map((v) => v.value)).toEqual(["Black", "White"]);
  });

  it("hides zero-count values only when hideEmpty is on", () => {
    const shown = buildFacets({
      config: config([filter({ hideEmpty: false })]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });
    expect(shown[0].values.map((v) => v.value)).toContain("Red");
  });

  it("keeps a selected value even when its count drops to zero", () => {
    // Otherwise the shopper could not untick it from the sidebar.
    const facets = buildFacets({
      config: config([filter()]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState("filter.v.option.color=Red"),
    });

    const red = facets[0].values.find((v) => v.value === "Red");
    expect(red).toBeDefined();
    expect(red?.active).toBe(true);
  });

  it("renders a selected value Shopify no longer returns at all", () => {
    const facets = buildFacets({
      config: config([filter()]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState("filter.v.option.color=Chartreuse"),
    });

    const value = facets[0].values.find((v) => v.value === "Chartreuse");
    expect(value).toMatchObject({ active: true, count: 0 });
  });

  it("applies merchant label and swatch overrides over Shopify's", () => {
    const facets = buildFacets({
      config: config([
        filter({
          overrides: new Map([
            ["Black", override({ value: "Black", label: "Jet black", swatchColor: "#111111" })],
          ]),
        }),
      ]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });

    const black = facets[0].values.find((v) => v.value === "Black");
    expect(black?.label).toBe("Jet black");
    expect(black?.swatch?.color).toBe("#111111");
  });

  it("respects a hidden override", () => {
    const facets = buildFacets({
      config: config([
        filter({
          overrides: new Map([["White", override({ value: "White", hidden: true })]]),
        }),
      ]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });

    expect(facets[0].values.map((v) => v.value)).not.toContain("White");
  });

  it("sorts by count, alphabetically, or manual position", () => {
    const byCount = buildFacets({
      config: config([filter({ valueSort: "count" })]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });
    expect(byCount[0].values.map((v) => v.value)).toEqual(["Black", "White"]);

    const byAlpha = buildFacets({
      config: config([filter({ valueSort: "alpha" })]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });
    expect(byAlpha[0].values.map((v) => v.value)).toEqual(["Black", "White"]);

    const manual = buildFacets({
      config: config([
        filter({
          valueSort: "manual",
          overrides: new Map([
            ["White", override({ value: "White", position: 0 })],
            ["Black", override({ value: "Black", position: 1 })],
          ]),
        }),
      ]),
      storefrontFilters: [shopifyValues],
      state: parseFilterState(""),
    });
    expect(manual[0].values.map((v) => v.value)).toEqual(["White", "Black"]);
  });

  it("derives a price range window from Shopify's input payload", () => {
    const priceFilter: StorefrontFilter = {
      id: "filter.v.price",
      label: "Price",
      type: "PRICE_RANGE",
      values: [
        {
          id: "filter.v.price",
          label: "Price",
          count: 20,
          input: JSON.stringify({ price: { min: 12, max: 240 } }),
          swatch: null,
        },
      ],
    };

    const facets = buildFacets({
      config: config([
        filter({
          handle: "price",
          name: "Price",
          param: "filter.v.price",
          source: "price",
          displayType: "range_slider",
        }),
      ]),
      storefrontFilters: [priceFilter],
      state: parseFilterState("filter.v.price.gte=45&filter.v.price.lte=83"),
    });

    expect(facets[0].range).toMatchObject({
      min: 12,
      max: 240,
      selectedMin: 45,
      selectedMax: 83,
    });
    expect(facets[0].activeCount).toBe(1);
  });

  it('builds "N stars and up" rating rows', () => {
    const ratingFilter: StorefrontFilter = {
      id: "filter.p.m.reviews.rating",
      label: "Rating",
      type: "LIST",
      values: [
        { id: "r5", label: "5", count: 3, input: "{}", swatch: null },
        { id: "r4", label: "4", count: 7, input: "{}", swatch: null },
        { id: "r3", label: "3", count: 2, input: "{}", swatch: null },
      ],
    };

    const facets = buildFacets({
      config: config([
        filter({
          handle: "rating",
          name: "Rating",
          param: "filter.p.m.reviews.rating",
          source: "rating",
          sourceKey: "reviews.rating",
          displayType: "rating",
        }),
      ]),
      storefrontFilters: [ratingFilter],
      state: parseFilterState("filter.p.m.reviews.rating.gte=4"),
    });

    const values = facets[0].values;
    expect(values).toHaveLength(5);
    // "4 and up" must aggregate the 4 and 5 buckets.
    expect(values.find((v) => v.value === "4")?.count).toBe(10);
    expect(values.find((v) => v.value === "5")?.count).toBe(3);
    expect(values.find((v) => v.value === "4")?.active).toBe(true);
  });

  it("omits a filter Shopify returned nothing for when hideEmpty is on", () => {
    const facets = buildFacets({
      config: config([filter({ handle: "vendor", param: "filter.p.vendor" })]),
      storefrontFilters: [],
      state: parseFilterState(""),
    });
    expect(facets).toHaveLength(0);
  });
});

describe("buildActiveChips", () => {
  it("emits one chip per value and a single chip per range", () => {
    const facets = buildFacets({
      config: config([
        filter(),
        filter({
          handle: "price",
          name: "Price",
          param: "filter.v.price",
          source: "price",
          displayType: "range",
          config: { unit: "$" },
        }),
      ]),
      storefrontFilters: [
        storefrontFilter("filter.v.option.color", [
          { label: "Black", count: 4 },
          { label: "White", count: 2 },
        ]),
        {
          id: "filter.v.price",
          label: "Price",
          type: "PRICE_RANGE",
          values: [
            {
              id: "p",
              label: "Price",
              count: 6,
              input: JSON.stringify({ price: { min: 0, max: 200 } }),
              swatch: null,
            },
          ],
        },
      ],
      state: parseFilterState(
        "filter.v.option.color=Black&filter.v.option.color=White&filter.v.price.gte=45&filter.v.price.lte=83",
      ),
    });

    const chips = buildActiveChips(facets, parseFilterState(
      "filter.v.option.color=Black&filter.v.option.color=White&filter.v.price.gte=45&filter.v.price.lte=83",
    ));

    expect(chips).toHaveLength(3);
    expect(chips[0].label).toBe("Colour: Black");
    expect(chips[2].label).toBe("Price: 45$ - 83$");
    expect(chips[2].value).toBeNull();
  });

  it("uses the merchant's label in the chip", () => {
    const resolved = filter({
      overrides: new Map([
        ["Black", override({ value: "Black", label: "Jet black" })],
      ]),
    });

    const state = parseFilterState("filter.v.option.color=Black");
    const facets = buildFacets({
      config: config([resolved]),
      storefrontFilters: [storefrontFilter("filter.v.option.color", [{ label: "Black", count: 1 }])],
      state,
    });

    expect(buildActiveChips(facets, state)[0].label).toBe("Colour: Jet black");
  });
});
