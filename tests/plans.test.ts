/** Plan gating and validation (CLAUDE.md §15, §16). */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN,
  PAID_PLAN_KEYS,
  PLANS,
  PLAN_KEYS,
  getPlan,
  isOverLimit,
  isPlanKey,
  planAllows,
  planLimit,
} from "../app/config/plans";
import {
  filterInputSchema,
  hexColor,
  shopifyImageUrl,
  suggestionInputSchema,
  toHandle,
  analyticsBatchSchema,
} from "../app/lib/validation";
import { validateSourceDisplayPair } from "../app/config/filter-types";

describe("plans", () => {
  it("matches the advertised pricing", () => {
    expect(PLANS.free.amount).toBe(0);
    expect(PLANS.standard.amount).toBe(19);
    expect(PLANS.pro.amount).toBe(49);
    expect(PAID_PLAN_KEYS).toEqual(["standard", "pro"]);
  });

  it("falls back to Free for an unknown plan key", () => {
    expect(getPlan("enterprise").key).toBe(DEFAULT_PLAN);
    expect(getPlan(null).key).toBe(DEFAULT_PLAN);
    expect(isPlanKey("enterprise")).toBe(false);
  });

  it("gates features by plan", () => {
    expect(planAllows("free", "metafieldFilters")).toBe(false);
    expect(planAllows("standard", "metafieldFilters")).toBe(true);
    expect(planAllows("standard", "synonyms")).toBe(false);
    expect(planAllows("pro", "synonyms")).toBe(true);
  });

  it("treats Pro limits as unlimited", () => {
    expect(planLimit("pro", "filters")).toBeNull();
    expect(isOverLimit("pro", "filters", 10_000)).toBe(false);
  });

  it("reports a numeric limit as reached at the boundary", () => {
    const limit = PLANS.free.limits.filters as number;
    expect(isOverLimit("free", "filters", limit - 1)).toBe(false);
    expect(isOverLimit("free", "filters", limit)).toBe(true);
  });

  it("gives every plan a complete entitlement map", () => {
    for (const key of PLAN_KEYS) {
      const entitlements = PLANS[key].entitlements;
      for (const value of Object.values(entitlements)) {
        expect(typeof value).toBe("boolean");
      }
    }
  });
});

describe("validation", () => {
  it("accepts only 6-digit hex colours", () => {
    expect(hexColor.safeParse("#1A1A1A").success).toBe(true);
    expect(hexColor.safeParse("#fff").success).toBe(false);
    expect(hexColor.safeParse("red").success).toBe(false);
    expect(hexColor.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("accepts only Shopify CDN images", () => {
    expect(
      shopifyImageUrl.safeParse("https://cdn.shopify.com/s/files/1/x.png").success,
    ).toBe(true);
    expect(shopifyImageUrl.safeParse("https://evil.example.com/x.png").success).toBe(
      false,
    );
    // http, even on the right host, is rejected.
    expect(shopifyImageUrl.safeParse("http://cdn.shopify.com/x.png").success).toBe(
      false,
    );
  });

  it("rejects an off-site search redirect", () => {
    expect(
      suggestionInputSchema.safeParse({
        term: "shoes",
        kind: "redirect",
        targetUrl: "https://evil.example.com",
      }).success,
    ).toBe(false);

    expect(
      suggestionInputSchema.safeParse({
        term: "shoes",
        kind: "redirect",
        targetUrl: "/collections/shoes",
      }).success,
    ).toBe(true);
  });

  it("requires a destination for a redirect", () => {
    expect(
      suggestionInputSchema.safeParse({ term: "shoes", kind: "redirect" }).success,
    ).toBe(false);
  });

  it("slugifies merchant names into handles", () => {
    expect(toHandle("Heel Height")).toBe("heel-height");
    expect(toHandle("  Shoe / Type!  ")).toBe("shoe-type");
    expect(toHandle("---")).toBe("");
  });

  it("blocks an invalid source and display-type pairing", () => {
    expect(validateSourceDisplayPair("price", "range_slider")).toBeNull();
    expect(validateSourceDisplayPair("price", "color_swatch")).toContain(
      "can only be displayed as",
    );
    expect(validateSourceDisplayPair("nonsense", "checkbox")).toContain(
      "Unknown data source",
    );
  });

  it("requires a source key for sources that need one", () => {
    const result = filterInputSchema.safeParse({
      name: "Colour",
      source: "product_option",
      displayType: "checkbox",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete filter definition", () => {
    const result = filterInputSchema.safeParse({
      name: "Colour",
      source: "product_option",
      sourceKey: "Color",
      displayType: "color_swatch",
    });
    expect(result.success).toBe(true);
  });

  it("has no shop field anywhere in the analytics payload", () => {
    // Shop identity must come from the verified proxy signature only.
    const parsed = analyticsBatchSchema.safeParse({
      sessionId: "abc",
      shop: "evil.myshopify.com",
      events: [{ type: "filter", filterHandle: "color", filterValue: "Black", resultCount: 3 }],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && "shop" in parsed.data).toBe(false);
  });

  it("caps an analytics batch", () => {
    const events = Array.from({ length: 100 }, () => ({
      type: "filter" as const,
      filterHandle: "color",
      filterValue: "Black",
      resultCount: 1,
    }));

    expect(analyticsBatchSchema.safeParse({ events }).success).toBe(false);
  });
});
