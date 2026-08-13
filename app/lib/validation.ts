/**
 * Server-side input validation (CLAUDE.md §16 — validate everything).
 *
 * Note what is deliberately absent: there is no `shopId` or `shop` field in any
 * schema. Shop identity comes from the authenticated session or the verified
 * app-proxy signature, never from client input.
 */

import { z } from "zod";
import {
  FILTER_DISPLAY_TYPES,
  FILTER_SOURCES,
  VALUE_SORTS,
  validateSourceDisplayPair,
} from "../config/filter-types";
import { PLAN_KEYS } from "../config/plans";
import { MAX_TERM_LENGTH, PER_PAGE_OPTIONS } from "./filter-url";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HANDLE = /^[a-z0-9][a-z0-9-_]{0,63}$/;

/** Only Shopify-hosted images may be used as swatches (CLAUDE.md §16). */
const SHOPIFY_CDN_HOSTS = ["cdn.shopify.com", "cdn.shopifycdn.net"];

export const shopifyImageUrl = z
  .string()
  .trim()
  .url("Enter a valid image URL")
  .refine((value) => {
    try {
      const { protocol, hostname } = new URL(value);
      return (
        protocol === "https:" &&
        SHOPIFY_CDN_HOSTS.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`),
        )
      );
    } catch {
      return false;
    }
  }, "Images must be hosted on the Shopify CDN");

export const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR, "Enter a 6-digit hex colour, for example #1A1A1A");

export const handleSchema = z
  .string()
  .trim()
  .regex(
    HANDLE,
    "Use lowercase letters, numbers, hyphens and underscores only",
  );

/** Converts a merchant-entered name into a URL-safe handle. */
export function toHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const filterInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    handle: handleSchema.optional(),
    groupId: z.string().trim().min(1).nullable().optional(),
    source: z.enum(FILTER_SOURCES),
    sourceKey: z.string().trim().max(200).nullable().optional(),
    displayType: z.enum(FILTER_DISPLAY_TYPES),
    enabled: z.boolean().default(true),
    multiSelect: z.boolean().default(true),
    showCount: z.boolean().default(true),
    hideEmpty: z.boolean().default(true),
    collapsedByDefault: z.boolean().default(false),
    searchableValues: z.boolean().default(false),
    maxVisibleValues: z.number().int().min(1).max(100).default(8),
    valueSort: z.enum(VALUE_SORTS).default("count"),
    config: z.record(z.unknown()).default({}),
  })
  .superRefine((value, ctx) => {
    const pairError = validateSourceDisplayPair(value.source, value.displayType);
    if (pairError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayType"],
        message: pairError,
      });
    }

    const needsKey = [
      "product_option",
      "variant_option",
      "product_metafield",
      "variant_metafield",
      "rating",
    ];
    if (needsKey.includes(value.source) && !value.sourceKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceKey"],
        message: "Choose which option or metafield this filter uses",
      });
    }
  });

export type FilterInput = z.infer<typeof filterInputSchema>;

export const filterValueInputSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().max(200).nullable().optional(),
  swatchColor: hexColor.nullable().optional(),
  swatchImage: shopifyImageUrl.nullable().optional(),
  position: z.number().int().min(0).max(9999).default(0),
  hidden: z.boolean().default(false),
});

export type FilterValueInput = z.infer<typeof filterValueInputSchema>;

export const reorderSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
});

// ---------------------------------------------------------------------------
// Filter groups
// ---------------------------------------------------------------------------

export const filterGroupInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  handle: handleSchema.optional(),
  enabled: z.boolean().default(true),
  defaultOpen: z.boolean().default(true),
  collapsible: z.boolean().default(true),
});

export type FilterGroupInput = z.infer<typeof filterGroupInputSchema>;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Desktop filter layouts. These are the shapes a merchant picks between in
 * Filters → Layout; each one maps to a `.scfs-app--<value>` rule in the
 * extension stylesheet, so adding one here means adding one there.
 */
export const LAYOUTS = [
  "sidebar",
  "offcanvas",
  "collapsed",
  "columns_1",
  "columns_2",
  "columns_3",
  "show_all",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const MOBILE_LAYOUTS = ["drawer", "fullscreen", "inline"] as const;
export type MobileLayout = (typeof MOBILE_LAYOUTS)[number];

export const collectionFilterInputSchema = z.object({
  collectionGid: z
    .string()
    .trim()
    .regex(/^gid:\/\/shopify\/Collection\/\d+$/, "Invalid collection id"),
  collectionHandle: z.string().trim().min(1).max(255),
  title: z.string().trim().max(120).nullable().optional(),
  enabled: z.boolean().default(true),
  useDefault: z.boolean().default(true),
  layout: z.enum(LAYOUTS).default("sidebar"),
  filterIds: z.array(z.string().trim().min(1)).max(200).default([]),
  settings: z.record(z.unknown()).default({}),
});

export type CollectionFilterInput = z.infer<typeof collectionFilterInputSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchConfigInputSchema = z.object({
  enabled: z.boolean().default(true),
  placeholder: z.string().trim().min(1).max(80).default("Search products"),
  minChars: z.number().int().min(1).max(10).default(2),
  debounceMs: z.number().int().min(0).max(2000).default(250),
  maxSuggestions: z.number().int().min(1).max(20).default(6),
  showImages: z.boolean().default(true),
  showPrices: z.boolean().default(true),
  showVendors: z.boolean().default(false),
  showProductTypes: z.boolean().default(false),
  showCollections: z.boolean().default(true),
  showViewAll: z.boolean().default(true),
  noResultsText: z.string().trim().min(1).max(200).default("No products found"),
});

export type SearchConfigInput = z.infer<typeof searchConfigInputSchema>;

export const synonymInputSchema = z.object({
  term: z.string().trim().min(1).max(80),
  synonyms: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "Add at least one synonym")
    .max(50),
  bidirectional: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type SynonymInput = z.infer<typeof synonymInputSchema>;

export const SUGGESTION_KINDS = ["custom", "redirect", "featured"] as const;

export const suggestionInputSchema = z
  .object({
    term: z.string().trim().min(1).max(80),
    kind: z.enum(SUGGESTION_KINDS).default("custom"),
    targetUrl: z.string().trim().max(500).nullable().optional(),
    position: z.number().int().min(0).max(999).default(0),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "redirect") {
      if (!value.targetUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetUrl"],
          message: "Redirects need a destination",
        });
        return;
      }
      // Only same-origin storefront paths — never an off-site redirect.
      if (!value.targetUrl.startsWith("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetUrl"],
          message: "Enter a storefront path starting with /",
        });
      }
    }
  });

export type SuggestionInput = z.infer<typeof suggestionInputSchema>;

// ---------------------------------------------------------------------------
// Settings & billing
// ---------------------------------------------------------------------------

export const ENGINES = ["auto", "native", "app"] as const;
export type Engine = (typeof ENGINES)[number];

export const generalSettingsSchema = z.object({
  engine: z.enum(ENGINES).default("auto"),
  defaultLayout: z.enum(LAYOUTS).default("sidebar"),
  mobileLayout: z.enum(MOBILE_LAYOUTS).default("drawer"),
  defaultPerPage: z
    .number()
    .int()
    .refine((v) => (PER_PAGE_OPTIONS as readonly number[]).includes(v))
    .default(24),
  columns: z.number().int().min(2).max(5).default(3),
  paginationStyle: z.enum(["numbered", "load_more"]).default("numbered"),
  showProductCount: z.boolean().default(true),
  showClearAll: z.boolean().default(true),
  showActiveFilters: z.boolean().default(true),
  showSort: z.boolean().default(true),
  showPerPage: z.boolean().default(true),
  mobileDrawer: z.boolean().default(true),
});

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const appearanceSettingsSchema = z.object({
  filterTitle: z.string().trim().max(60).default("Filters"),
  filterPosition: z.enum(["left", "right"]).default("left"),
  filterSpacing: z.enum(["compact", "base", "loose"]).default("base"),
  accentColor: hexColor.default("#1a1a1a"),
  borderRadius: z.number().int().min(0).max(24).default(6),
  swatchSize: z.number().int().min(16).max(64).default(28),
  customCss: z.string().max(10_000).default(""),
});

export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

export const analyticsSettingsSchema = z.object({
  trackSearches: z.boolean().default(true),
  trackFilters: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(365).default(90),
});

export type AnalyticsSettings = z.infer<typeof analyticsSettingsSchema>;

export const planSelectionSchema = z.object({
  plan: z.enum(PLAN_KEYS),
});

// ---------------------------------------------------------------------------
// Storefront analytics ingest (untrusted input from the browser)
// ---------------------------------------------------------------------------

export const searchEventSchema = z.object({
  type: z.literal("search"),
  term: z.string().trim().min(1).max(MAX_TERM_LENGTH),
  resultCount: z.number().int().min(0).max(1_000_000),
  kind: z.enum(["search", "predictive"]).default("search"),
  collectionHandle: z.string().trim().max(255).nullable().optional(),
  clickedProductId: z.string().trim().max(100).nullable().optional(),
  locale: z.string().trim().max(20).nullable().optional(),
});

export const filterEventSchema = z.object({
  type: z.literal("filter"),
  filterHandle: z.string().trim().min(1).max(80),
  filterValue: z.string().trim().min(1).max(200),
  resultCount: z.number().int().min(0).max(1_000_000),
  collectionHandle: z.string().trim().max(255).nullable().optional(),
});

export const analyticsBatchSchema = z.object({
  /** Opaque client-generated id; hashed with a server salt before storage. */
  sessionId: z.string().trim().max(100).optional(),
  events: z
    .array(z.discriminatedUnion("type", [searchEventSchema, filterEventSchema]))
    .min(1)
    .max(50),
});

export type AnalyticsBatch = z.infer<typeof analyticsBatchSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface FieldErrors {
  [field: string]: string;
}

/** Flattens a ZodError into a `{ field: message }` map for Polaris fields. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: fieldErrors(result.error) };
}

/** Reads a `FormData` body into a plain object, coercing checkbox/number fields. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;

    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const existing = result[name];
      if (Array.isArray(existing)) existing.push(value);
      else result[name] = [value];
      continue;
    }

    if (value === "true") result[key] = true;
    else if (value === "false") result[key] = false;
    else result[key] = value;
  }
  return result;
}
