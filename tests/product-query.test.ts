/**
 * Filter -> ProductFilter mapping and total-count derivation.
 *
 * These two are the load-bearing parts of the app engine: get the mapping wrong
 * and results are silently unfiltered; get the count wrong and pagination lies.
 */

import { describe, expect, it } from "vitest";
import {
  buildProductFilters,
  deriveTotalCount,
  indexFacetInputs,
  SEARCH_SUPPORTED_SORTS,
  type StorefrontFilter,
} from "../app/services/storefront/product-query.server";
import { parseFilterState } from "../app/lib/filter-url";

describe("buildProductFilters", () => {
  it("maps availability to a boolean", () => {
    expect(buildProductFilters(parseFilterState("filter.v.availability=1"))).toEqual([
      { available: true },
    ]);
    expect(buildProductFilters(parseFilterState("filter.v.availability=0"))).toEqual([
      { available: false },
    ]);
  });

  it("maps vendor, product type and tag", () => {
    const filters = buildProductFilters(
      parseFilterState(
        "filter.p.vendor=Nike&filter.p.product_type=Sneakers&filter.p.tag=Sale",
      ),
    );

    expect(filters).toEqual(
      expect.arrayContaining([
        { productVendor: "Nike" },
        { productType: "Sneakers" },
        { tag: "Sale" },
      ]),
    );
  });

  it("emits one entry per value so Shopify ORs them", () => {
    const filters = buildProductFilters(
      parseFilterState("filter.v.option.color=Black&filter.v.option.color=White"),
    );

    expect(filters).toEqual([
      { variantOption: { name: "color", value: "Black" } },
      { variantOption: { name: "color", value: "White" } },
    ]);
  });

  it("maps a price range to Shopify's price filter", () => {
    expect(
      buildProductFilters(parseFilterState("filter.v.price.gte=45&filter.v.price.lte=83")),
    ).toEqual([{ price: { min: 45, max: 83 } }]);
  });

  it("supports an open-ended price range", () => {
    expect(buildProductFilters(parseFilterState("filter.v.price.gte=45"))).toEqual([
      { price: { min: 45 } },
    ]);
    expect(buildProductFilters(parseFilterState("filter.v.price.lte=83"))).toEqual([
      { price: { max: 83 } },
    ]);
  });

  it("splits a metafield param back into namespace and key", () => {
    expect(
      buildProductFilters(parseFilterState("filter.p.m.custom.material=Cotton")),
    ).toEqual([
      { productMetafield: { namespace: "custom", key: "material", value: "Cotton" } },
    ]);

    expect(
      buildProductFilters(parseFilterState("filter.v.m.custom.width=Wide")),
    ).toEqual([
      { variantMetafield: { namespace: "custom", key: "width", value: "Wide" } },
    ]);
  });

  it("prefers a recorded facet input over a constructed filter", () => {
    // Shopify's own `input` payload is authoritative for bucketed values.
    const recorded = JSON.stringify({
      productMetafield: { namespace: "custom", key: "material", value: "opaque-token" },
    });

    const filters = buildProductFilters(
      parseFilterState("filter.p.m.custom.material=Cotton"),
      { "filter.p.m.custom.material": { Cotton: recorded } },
    );

    expect(filters).toEqual([JSON.parse(recorded)]);
  });

  it("expands a metafield range into every bucket at or above the threshold", () => {
    const inputs = {
      "filter.p.m.reviews.rating": {
        "5": JSON.stringify({ productMetafield: { namespace: "reviews", key: "rating", value: "5" } }),
        "4": JSON.stringify({ productMetafield: { namespace: "reviews", key: "rating", value: "4" } }),
        "3": JSON.stringify({ productMetafield: { namespace: "reviews", key: "rating", value: "3" } }),
      },
    };

    const filters = buildProductFilters(
      parseFilterState("filter.p.m.reviews.rating.gte=4"),
      inputs,
    );

    // 4 and 5 qualify; 3 does not.
    expect(filters).toHaveLength(2);
    const values = filters.map(
      (f) => (f.productMetafield as { value: string }).value,
    );
    expect(values.sort()).toEqual(["4", "5"]);
  });

  it("ignores a filter it cannot express rather than sending garbage", () => {
    expect(buildProductFilters(parseFilterState("filter.p.title=Boot"))).toEqual([]);
  });

  it("returns nothing for an empty state", () => {
    expect(buildProductFilters(parseFilterState(""))).toEqual([]);
  });
});

describe("deriveTotalCount", () => {
  const pageInfo = (hasNextPage: boolean) => ({
    hasNextPage,
    hasPreviousPage: false,
    endCursor: "abc",
    startCursor: "abc",
  });

  it("is exact when a single page holds every result", () => {
    expect(deriveTotalCount([], 10, pageInfo(false), 1)).toEqual({
      total: 10,
      source: "single-page",
    });
  });

  it("sums the availability facet, which partitions the catalogue exactly once", () => {
    const availability: StorefrontFilter = {
      id: "filter.v.availability",
      label: "Availability",
      type: "LIST",
      values: [
        { id: "in", label: "In stock", count: 90, input: "{}", swatch: null },
        { id: "out", label: "Out of stock", count: 18, input: "{}", swatch: null },
      ],
    };

    expect(deriveTotalCount([availability], 24, pageInfo(true), 1)).toEqual({
      total: 108,
      source: "partition-facet",
    });
  });

  it("refuses to guess when no partitioning facet is present", () => {
    const tags: StorefrontFilter = {
      id: "filter.p.tag",
      label: "Tag",
      type: "LIST",
      values: [
        { id: "a", label: "A", count: 40, input: "{}", swatch: null },
        { id: "b", label: "B", count: 40, input: "{}", swatch: null },
      ],
    };

    // Summing tags would double-count multi-tagged products.
    expect(deriveTotalCount([tags], 24, pageInfo(true), 1)).toEqual({
      total: null,
      source: "unknown",
    });
  });

  it("does not treat a later page's node count as a total", () => {
    expect(deriveTotalCount([], 4, pageInfo(false), 3).source).not.toBe("single-page");
  });
});

describe("indexFacetInputs", () => {
  it("records label -> input per param", () => {
    const filters: StorefrontFilter[] = [
      {
        id: "filter.p.tag",
        label: "Tag",
        type: "LIST",
        values: [
          { id: "1", label: "Sale", count: 3, input: '{"tag":"Sale"}', swatch: null },
        ],
      },
    ];

    expect(indexFacetInputs(filters, (id) => id)).toEqual({
      "filter.p.tag": { Sale: '{"tag":"Sale"}' },
    });
  });

  it("skips filters with no param mapping", () => {
    const filters: StorefrontFilter[] = [
      { id: "unmapped", label: "x", type: "LIST", values: [] },
    ];
    expect(indexFacetInputs(filters, () => null)).toEqual({});
  });
});

describe("search sort support", () => {
  it("only advertises the sorts the Storefront search API actually has", () => {
    // Shopify's SearchSortKeys is RELEVANCE and PRICE only — the UI must not
    // offer title/date sorts on a search page and silently reorder.
    expect(SEARCH_SUPPORTED_SORTS.sort()).toEqual([
      "price-ascending",
      "price-descending",
      "relevance",
    ]);
  });
});
