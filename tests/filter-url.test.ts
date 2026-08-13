/**
 * URL codec tests (CLAUDE.md §18 — round-trip property tests).
 *
 * This codec is the contract between the storefront bundle, the proxy endpoints
 * and shareable URLs. If it drifts, filters silently stop matching.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PER_PAGE,
  MAX_PAGE,
  MAX_TERM_LENGTH,
  activeFilterCount,
  clearAllFilters,
  emptyFilterState,
  filterSignature,
  filterStateToSearch,
  fromParamKey,
  parseFilterState,
  removeSelection,
  serializeFilterState,
  setPage,
  setPerPage,
  setRange,
  setSort,
  setTerm,
  toParamKey,
  toggleValue,
  type FilterState,
} from "../app/lib/filter-url";

describe("toParamKey", () => {
  it("mirrors Shopify's native parameter names", () => {
    expect(toParamKey("price")).toBe("filter.v.price");
    expect(toParamKey("availability")).toBe("filter.v.availability");
    expect(toParamKey("vendor")).toBe("filter.p.vendor");
    expect(toParamKey("product_type")).toBe("filter.p.product_type");
    expect(toParamKey("tag")).toBe("filter.p.tag");
    expect(toParamKey("product_option", "Color")).toBe("filter.v.option.color");
    expect(toParamKey("product_metafield", "custom.material")).toBe(
      "filter.p.m.custom.material",
    );
    expect(toParamKey("variant_metafield", "custom.width")).toBe(
      "filter.v.m.custom.width",
    );
  });

  it("normalises multi-word option names the way Shopify does", () => {
    expect(toParamKey("product_option", "Heel Height")).toBe(
      "filter.v.option.heel_height",
    );
    expect(toParamKey("product_option", "  Shoe   Type  ")).toBe(
      "filter.v.option.shoe_type",
    );
  });

  it("returns null when a required source key is missing", () => {
    expect(toParamKey("product_option", null)).toBeNull();
    expect(toParamKey("product_metafield", "")).toBeNull();
  });

  it("round-trips through fromParamKey", () => {
    const cases: [string, string | null][] = [
      ["price", null],
      ["availability", null],
      ["vendor", null],
      ["product_type", null],
      ["tag", null],
      ["product_option", "color"],
      ["product_metafield", "custom.material"],
      ["variant_metafield", "custom.width"],
    ];

    for (const [source, key] of cases) {
      const param = toParamKey(source, key);
      expect(param).not.toBeNull();
      const back = fromParamKey(param!);
      expect(back).not.toBeNull();
      expect(toParamKey(back!.source, back!.sourceKey)).toBe(param);
    }
  });
});

describe("parseFilterState", () => {
  it("reads a full Shopify-style query string", () => {
    const state = parseFilterState(
      "q=running+shoes&filter.v.option.color=Black&filter.v.option.color=White" +
        "&filter.p.tag=Glitter&filter.v.price.gte=45&filter.v.price.lte=83" +
        "&filter.v.availability=1&sort_by=price-ascending&page=3&limit=48",
    );

    expect(state.term).toBe("running shoes");
    expect(state.sort).toBe("price-ascending");
    expect(state.page).toBe(3);
    expect(state.perPage).toBe(48);
    expect(state.selections["filter.v.option.color"].values).toEqual([
      "Black",
      "White",
    ]);
    expect(state.selections["filter.p.tag"].values).toEqual(["Glitter"]);
    expect(state.selections["filter.v.price"]).toMatchObject({ min: 45, max: 83 });
    expect(state.selections["filter.v.availability"].values).toEqual(["1"]);
  });

  it("ignores unknown parameters rather than echoing them back", () => {
    const state = parseFilterState("utm_source=newsletter&evil=<script>&page=2");
    expect(Object.keys(state.selections)).toHaveLength(0);
    expect(filterStateToSearch(state)).toBe("?page=2");
  });

  it("rejects an unknown sort value", () => {
    expect(parseFilterState("sort_by=drop-tables").sort).toBeNull();
  });

  it("rejects a per-page value outside the allowed set", () => {
    expect(parseFilterState("limit=1000").perPage).toBeNull();
    expect(parseFilterState("limit=24").perPage).toBe(24);
  });

  it("clamps the page number", () => {
    expect(parseFilterState("page=999999").page).toBe(MAX_PAGE);
    expect(parseFilterState("page=0").page).toBe(1);
    expect(parseFilterState("page=-5").page).toBe(1);
    expect(parseFilterState("page=abc").page).toBe(1);
  });

  it("truncates an over-long search term", () => {
    const term = "x".repeat(500);
    expect(parseFilterState(`q=${term}`).term).toHaveLength(MAX_TERM_LENGTH);
  });

  it("drops empty values and empty selections", () => {
    const state = parseFilterState("filter.p.tag=&filter.p.vendor=Nike");
    expect(state.selections["filter.p.tag"]).toBeUndefined();
    expect(state.selections["filter.p.vendor"].values).toEqual(["Nike"]);
  });

  it("deduplicates repeated values", () => {
    const state = parseFilterState("filter.p.tag=A&filter.p.tag=A&filter.p.tag=B");
    expect(state.selections["filter.p.tag"].values).toEqual(["A", "B"]);
  });

  it("swaps inverted range bounds instead of returning nothing", () => {
    const state = parseFilterState("filter.v.price.gte=90&filter.v.price.lte=10");
    expect(state.selections["filter.v.price"]).toMatchObject({ min: 10, max: 90 });
  });

  it("caps the number of values accepted for one filter", () => {
    const params = Array.from({ length: 200 }, (_, i) => `filter.p.tag=t${i}`).join("&");
    expect(parseFilterState(params).selections["filter.p.tag"].values.length).toBe(64);
  });
});

describe("serialization round trip", () => {
  const searches = [
    "",
    "q=boots",
    "filter.v.option.color=Black",
    "filter.v.option.color=Black&filter.v.option.color=White&filter.p.tag=Sale",
    "filter.v.price.gte=45&filter.v.price.lte=83",
    "q=shoes&sort_by=title-ascending&page=4&limit=36&filter.p.vendor=Nike",
    "filter.p.m.reviews.rating.gte=4",
  ];

  it("is stable: parse -> serialize -> parse yields the same state", () => {
    for (const search of searches) {
      const first = parseFilterState(search);
      const second = parseFilterState(serializeFilterState(first));
      expect(second).toEqual(first);
    }
  });

  it("produces a deterministic signature regardless of input order", () => {
    const a = parseFilterState(
      "filter.p.tag=B&filter.p.tag=A&filter.v.option.color=Red&sort_by=manual",
    );
    const b = parseFilterState(
      "sort_by=manual&filter.v.option.color=Red&filter.p.tag=A&filter.p.tag=B",
    );
    expect(filterSignature(a)).toBe(filterSignature(b));
  });

  it("omits the default per-page and page 1 from the URL", () => {
    let state = emptyFilterState();
    state = setPerPage(state, DEFAULT_PER_PAGE);
    expect(filterStateToSearch(state)).toBe("");

    state = setPerPage(state, 48);
    expect(filterStateToSearch(state)).toBe("?limit=48");
  });
});

describe("mutations", () => {
  it("toggles a value on and off", () => {
    let state = emptyFilterState();
    state = toggleValue(state, "filter.p.tag", "Sale");
    expect(state.selections["filter.p.tag"].values).toEqual(["Sale"]);

    state = toggleValue(state, "filter.p.tag", "Sale");
    expect(state.selections["filter.p.tag"]).toBeUndefined();
  });

  it("replaces the value when multiSelect is false", () => {
    let state = toggleValue(emptyFilterState(), "filter.p.vendor", "Nike", false);
    state = toggleValue(state, "filter.p.vendor", "Adidas", false);
    expect(state.selections["filter.p.vendor"].values).toEqual(["Adidas"]);
  });

  it("resets pagination on every filter change", () => {
    const base = setPage(emptyFilterState(), 5);
    expect(base.page).toBe(5);

    expect(toggleValue(base, "filter.p.tag", "A").page).toBe(1);
    expect(setRange(base, "filter.v.price", 10, 20).page).toBe(1);
    expect(clearAllFilters(base).page).toBe(1);
    expect(setTerm(base, "boots").page).toBe(1);
    expect(setSort(base, "price-ascending").page).toBe(1);
    expect(setPerPage(base, 48).page).toBe(1);

    const withTag = setPage(parseFilterState("filter.p.tag=A"), 5);
    expect(removeSelection(withTag, "filter.p.tag").page).toBe(1);
  });

  it("is a no-op when removing a filter that is not active", () => {
    // Removing nothing must not yank the shopper back to page 1.
    const base = setPage(parseFilterState("filter.p.vendor=Nike"), 5);
    const result = removeSelection(base, "filter.p.tag");

    expect(result.page).toBe(5);
    expect(result.selections).toEqual(base.selections);
  });

  it("keeps the term, sort and per-page when clearing filters", () => {
    let state = parseFilterState(
      "q=boots&sort_by=price-ascending&limit=48&filter.p.tag=A&filter.v.price.gte=10",
    );
    state = clearAllFilters(state);

    expect(state.term).toBe("boots");
    expect(state.sort).toBe("price-ascending");
    expect(state.perPage).toBe(48);
    expect(Object.keys(state.selections)).toHaveLength(0);
  });

  it("removes a single value without clearing the rest", () => {
    let state = parseFilterState("filter.p.tag=A&filter.p.tag=B&filter.p.tag=C");
    state = removeSelection(state, "filter.p.tag", "B");
    expect(state.selections["filter.p.tag"].values).toEqual(["A", "C"]);
  });

  it("never mutates the input state", () => {
    const original = parseFilterState("filter.p.tag=A");
    const snapshot: FilterState = JSON.parse(JSON.stringify(original));

    toggleValue(original, "filter.p.tag", "B");
    setRange(original, "filter.v.price", 1, 2);
    clearAllFilters(original);

    expect(original).toEqual(snapshot);
  });

  it("counts a range as one active filter and each value as one", () => {
    const state = parseFilterState(
      "filter.p.tag=A&filter.p.tag=B&filter.v.price.gte=10&filter.v.price.lte=90",
    );
    expect(activeFilterCount(state)).toBe(3);
  });

  it("clears a range when both bounds are null", () => {
    let state = setRange(emptyFilterState(), "filter.v.price", 10, 90);
    expect(state.selections["filter.v.price"]).toBeDefined();

    state = setRange(state, "filter.v.price", null, null);
    expect(state.selections["filter.v.price"]).toBeUndefined();
  });
});
