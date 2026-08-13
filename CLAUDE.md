@AGENTS.md

# Stable Custom Filter & Search — Project Source of Truth

> This file is the **single source of truth** for the project: specification, architecture,
> UI/UX requirements, database design, Shopify integration, phases, testing, and progress.
> It is a **living document**. Update the [Progress Tracking](#50-progress-tracking) section
> after every meaningful change.

---

## 0. How to work in this repo (read first)

1. Read this file **before** starting any task.
2. Check [§50 Progress Tracking](#50-progress-tracking) — find **Current Phase** and **Next Task**.
3. Continue from the last incomplete task. Do **not** redo completed work.
4. Inspect existing code before inventing new architecture. Reuse components, services, utilities.
5. Do not rewrite working code without a stated reason.
6. TypeScript everywhere. Avoid `any`; use `unknown` + narrowing when a type is genuinely open.
7. Validate every server input (zod). Never trust a client-supplied shop identifier.
8. Keep Shopify API calls server-side. Keep storefront JS small (see [§43 budgets](#43-performance-requirements)).
9. Handle **loading**, **empty**, and **error** states for every UI surface.
10. Test each feature before marking it done. **Never** mark a partially implemented feature complete.
11. After completing a feature: implement → test → verify → update §50 → record notes → next task.

**Definition of Done** for any feature:

- Types check (`npm run typecheck`) and lint passes (`npm run lint`).
- Unit/integration tests exist and pass for the new logic.
- Loading / empty / error states implemented.
- Shop isolation enforced and covered by a test.
- §50 Progress Tracking updated in the same change.

---

## 1. Project overview

| Item | Value |
| --- | --- |
| App name | **Stable Custom Filter & Search** |
| App type | Shopify **embedded admin app** + **Theme App Extension** |
| Distribution | `AppStore` (public app) |
| Purpose | Customizable product **filtering** and **search** for the storefront |
| Quality bar | Production-ready, App Store submittable — not a prototype |

Capability summary: product filtering, product search, predictive search, multi-select filters,
filter groups, collection-specific filters, product counts, price range, color swatches, image
swatches, size/tag/rating/availability filters, custom metafield filters, sorting, pagination,
AJAX filtering, active filter chips, mobile filter drawer, desktop sidebar, configurable layouts,
search configuration, analytics, and an admin configuration surface.

### 1.1 Reference storefront UI

A storefront screenshot accompanies this project as a **visual reference only**.

- Follow its **structure and functionality**: header, search field, page heading, breadcrumb,
  left filter sidebar, product search field, product count, results-per-page selector, sort
  selector, active filter chips, product grid, product cards with images / sale badges / prices /
  variants, filter groups, price range slider, color swatches, tag filters, availability filters,
  rating filters, responsive behaviour.
- Do **not** copy its design, branding, colours, logos, or proprietary assets.
- Build a clean, modern, **configurable, Shopify-native** interpretation. Appearance must be
  merchant-customizable through theme extension settings and admin appearance settings.

---

## 2. Ground truth — current repository state

Verified by inspection. Keep this table accurate; it is what new work must build on.

| Area | Reality |
| --- | --- |
| Framework | **React Router v7** (`react-router` 7.12, `@react-router/fs-routes`) — **not Remix** |
| Shopify adapter | `@shopify/shopify-app-react-router` ^1.2.1 |
| Admin UI | **Polaris web components** (`s-page`, `s-section`, `s-button`, …) via App Bridge. `@shopify/polaris` React package is **not installed** and should not be added |
| App Bridge | `@shopify/app-bridge-react` ^4.2.4 (`useAppBridge`, `shopify.toast`, `shopify.intents`) |
| Language | Template ships **JavaScript** (`.jsx`/`.js`). `tsconfig.json` exists (`strict: true`, `allowJs: true`) |
| Routing | File-system flat routes via `flatRoutes()` in `app/routes.js` |
| Database | Prisma 6.16 + **SQLite** (`prisma/dev.sqlite`). Only the `Session` model exists |
| Session storage | `@shopify/shopify-app-session-storage-prisma` |
| Admin API version | `ApiVersion.July26` in `app/shopify.server.js` and `.graphqlrc.js`; `api_version = "2026-10"` for webhooks in `shopify.app.toml` — **mismatch, must be reconciled** |
| Access scopes | `write_products,write_metaobjects,write_metaobject_definitions` — template demo scopes, must be reviewed |
| Webhooks | Declarative in `shopify.app.toml`: `app/uninstalled`, `app/scopes_update` |
| Theme extension | `extensions/` contains only `.gitkeep` — **nothing generated yet** |
| App proxy | **Not configured** |
| Billing | Not configured |
| Tests | **No test runner installed** |
| Node | `>=20.19 <22 || >=22.12` |
| Codegen | `@shopify/api-codegen-preset` → `app/types` (`npm run graphql-codegen`) |
| MCP | `.mcp.json` registers `shopify-dev-mcp` |

### 2.1 Template artifacts to remove during Phase 1

- `app/routes/app.additional.jsx` (demo page).
- Demo product/metaobject mutation in `app/routes/app._index.jsx`.
- `[product.metafields.app.demo_info]` and `[metaobjects.app.example]` blocks in `shopify.app.toml`,
  plus the `write_metaobjects` / `write_metaobject_definitions` scopes they required.
- `app/.DS_Store`, `app/routes/.DS_Store`.

---

## 3. Tech stack and architecture decisions

Decisions are binding unless this file is updated with a reason.

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Keep **React Router v7**; never introduce Remix imports | Matches installed adapter |
| D2 | Admin UI uses **Polaris web components** only | Template + App Bridge default; adding Polaris React would double the design system |
| D3 | Migrate the app to **TypeScript** in Phase 1 (`.jsx` → `.tsx`) | Rule 6; `tsconfig` already strict |
| D4 | **PostgreSQL** for production; schema authored **provider-portable** so local SQLite keeps working | SQLite cannot serve analytics aggregation at scale |
| D5 | JSON columns stored as `String` (stringified) and enums as `String` + const unions | Prisma SQLite supports neither `Json` nor `enum`; keeps one schema for both providers |
| D6 | Storefront data is fetched **server-side** through an **App Proxy**; the browser never talks to Shopify APIs with app credentials | Security + §42 |
| D7 | Two storefront engines — **Native** and **App** (see §7). Native is the default when possible | §41: minimum JS, minimum API calls |
| D8 | Facet values and counts come from Shopify's **Storefront API `filters`** on `collection.products` / `search`, not from client-side catalog scans | §41: never download the catalog |
| D9 | Predictive search uses the theme's native `/search/suggest.json` unless synonyms/redirects/custom suggestions are enabled, which routes it through the app proxy | Zero-cost fast path |
| D10 | Filter URL grammar mirrors **Shopify's native `filter.*` params** | §19 compatibility requirement |
| D11 | Plan definitions live in **one** module (`app/config/plans.ts`) and are referenced everywhere | §36: no hardcoded pricing scattered around |
| D12 | Validation with **zod**; storefront JS is dependency-free vanilla ES modules | Bundle budget |

### 3.1 Dependencies to add

Runtime: `zod`.
Dev: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/user-event`,
`jsdom`, `msw`, `@playwright/test`, `prettier` (present).

---

## 4. System architecture

```text
┌───────────────────────── Shopify Admin (embedded iframe) ─────────────────────────┐
│  App Bridge + Polaris web components                                              │
│  Dashboard · Filters · Groups · Collections · Search · Analytics · Settings ·      │
│  Pricing · Help                                                                    │
└───────────────▲───────────────────────────────────────────────────────────────────┘
                │ session token (authenticate.admin)
┌───────────────┴───────────────── App server (React Router v7, Node) ──────────────┐
│  routes/          loaders + actions + resource routes                             │
│  services/        filter · search · storefront · analytics · billing · shop       │
│  models/          Prisma access, always shop-scoped                               │
│  lib/             filter-url codec · validation · cache · logging                 │
│         │                              │                          │               │
│         ▼                              ▼                          ▼               │
│  Prisma / Postgres          Admin GraphQL API          Storefront GraphQL API      │
└───────────────▲───────────────────────────────────────────────────────────────────┘
                │ App Proxy  /apps/scfs/*  (HMAC-signed by Shopify)
┌───────────────┴───────────────── Storefront (Online Store theme) ─────────────────┐
│  Theme App Extension                                                              │
│  blocks: filter-sidebar · product-search · filter-search · active-filters ·       │
│          filter-toolbar · product-results · app-embed                             │
│  assets: scfs-core.js · scfs-filters.js · scfs-search.js · scfs.css               │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Directory structure (target)

Adapted to the real React Router template rather than forcing a generic layout.

```text
app/
├── routes/                      # flat-file routes (flatRoutes())
│   ├── app.tsx                  # embedded shell + nav
│   ├── app._index.tsx           # Dashboard
│   ├── app.filters._index.tsx
│   ├── app.filters.new.tsx
│   ├── app.filters.$id.tsx      # Filter builder (edit)
│   ├── app.groups._index.tsx
│   ├── app.groups.$id.tsx
│   ├── app.collections._index.tsx
│   ├── app.collections.$handle.tsx
│   ├── app.search.tsx           # search configuration
│   ├── app.search.synonyms.tsx
│   ├── app.search.suggestions.tsx
│   ├── app.analytics._index.tsx
│   ├── app.analytics.searches.tsx
│   ├── app.analytics.filters.tsx
│   ├── app.settings.tsx
│   ├── app.pricing.tsx
│   ├── app.help.tsx
│   ├── api.metafields.tsx       # admin-authenticated resource routes
│   ├── api.collections.tsx
│   ├── api.filters.reorder.tsx
│   ├── proxy.config.tsx         # ── App Proxy endpoints ──
│   ├── proxy.products.tsx
│   ├── proxy.suggest.tsx
│   ├── proxy.events.tsx
│   ├── auth.$.tsx
│   ├── auth.login/
│   ├── webhooks.app.uninstalled.tsx
│   ├── webhooks.app.scopes_update.tsx
│   ├── webhooks.products.update.tsx
│   ├── webhooks.products.delete.tsx
│   ├── webhooks.collections.update.tsx
│   └── webhooks.collections.delete.tsx
├── components/
│   ├── admin/                   # Polaris-web-component wrappers
│   │   ├── FilterList.tsx  FilterForm.tsx  FilterTypePicker.tsx
│   │   ├── SortableList.tsx  MetafieldPicker.tsx  CollectionPicker.tsx
│   │   ├── StatCard.tsx  UsageMeter.tsx  DateRangePicker.tsx
│   │   └── charts/              # dependency-free SVG charts
│   └── common/
├── services/
│   ├── filters/   filter.service.ts · facet.service.ts · filter-query.service.ts
│   ├── search/    search.service.ts · predictive.service.ts · synonym.service.ts
│   ├── storefront/ storefront-client.server.ts · product-query.server.ts
│   ├── admin/     collections.server.ts · metafields.server.ts
│   ├── analytics/ event.service.ts · rollup.service.ts
│   ├── billing/   billing.server.ts · usage.server.ts
│   └── shop/      shop.server.ts
├── models/                      # Prisma access — every function takes shopId
├── lib/
│   ├── filter-url.ts            # SHARED codec (server + extension), zero deps
│   ├── validation/              # zod schemas
│   ├── cache.server.ts
│   ├── proxy.server.ts          # app proxy auth + shop resolution helpers
│   └── logger.server.ts
├── config/
│   ├── plans.ts                 # single source of pricing/limits
│   └── filter-types.ts          # filter source + display-type registry
├── types/                       # generated GraphQL types + shared domain types
├── graphql/                     # .graphql documents
├── db.server.ts
├── shopify.server.ts
├── root.tsx
├── entry.server.tsx
└── routes.ts

extensions/stable-custom-filter/     # only these four directories are allowed
├── shopify.extension.toml
├── blocks/      filter-sidebar · product-search · filter-search · active-filters ·
│                filter-toolbar · product-results · app-embed (.liquid)
├── snippets/    scfs-filter-group · scfs-product-card · scfs-swatch (.liquid)
├── assets/      scfs.js · scfs.css   (built — do not edit)
└── locales/     en.default.json

extension-src/                       # TypeScript source for extensions/*/assets/scfs.js

prisma/
├── schema.prisma
└── migrations/
```

### 4.2 Shared filter-URL codec

`app/lib/filter-url.ts` is the **only** implementation of the URL grammar. It must be
dependency-free and isomorphic. A build step (`npm run build:extension`) bundles it into
`extensions/stable-custom-filter/assets/scfs.js` via `extension-src/`, which imports the codec
directly — so the two cannot drift.

### 4.3 AJAX filtering data flow

```text
Customer toggles a filter
  → extension updates in-memory filter state
  → codec serialises state → query string
  → history.pushState (URL now shareable / back-button safe)
  → loading state rendered (skeletons, aria-busy)
  → Engine Native: fetch ?section_id=<collection section>   (theme HTML)
    Engine App:    fetch /apps/scfs/products?<params>       (JSON)
  → response applied: product grid, product count, facet counts,
    active-filter chips, pagination, drawer badge
  → analytics event queued (batched, sendBeacon on idle/unload)
```

Race handling: every request carries a monotonic sequence number; stale responses are discarded.
In-flight requests are aborted via `AbortController` when a newer one starts.

---

## 5. Database design

Prisma. Provider-portable per **D4/D5**: no `enum`, no `Json` — string unions and stringified
JSON instead. Every merchant-owned row carries `shopId`. Every query is shop-scoped.

### 5.1 Models

| Model | Purpose |
| --- | --- |
| `Session` | Shopify session storage (exists; do not modify shape) |
| `Shop` | One row per installed shop; install state, plan pointer, tokens metadata |
| `FilterGroup` | Named, orderable, collapsible section containing filters |
| `Filter` | A single filter definition (source + display type + behaviour) |
| `FilterValue` | Curated/overridden values: label, swatch colour, swatch image, order, hidden |
| `CollectionFilter` | Per-collection configuration record |
| `CollectionFilterItem` | Join: which filters/groups apply to a collection, in what order |
| `SearchConfiguration` | Per-shop search + predictive search settings |
| `SearchEvent` | Raw search interaction |
| `FilterEvent` | Raw filter interaction |
| `SearchTermStat` | Daily rollup per normalised term (dashboard performance) |
| `FilterUsageStat` | Daily rollup per filter/value |
| `SearchSuggestion` | Custom suggestions / redirects / featured terms |
| `SearchSynonym` | Synonym sets |
| `AppSettings` | General, appearance, and analytics settings blobs |
| `Subscription` | Shopify billing subscription state |
| `Usage` | Monthly metered usage counters |
| `ActivityLog` | Audit trail shown in Dashboard → Recent Activity |

`SearchTermStat` / `FilterUsageStat` are additions beyond §38's suggested list: dashboards must
not aggregate raw event tables at request time.

### 5.2 Schema sketch

```prisma
model Shop {
  id                String   @id @default(cuid())
  domain            String   @unique          // xxx.myshopify.com
  name              String?
  email             String?
  currencyCode      String?
  planName          String?                   // Shopify's plan, not ours
  installedAt       DateTime @default(now())
  uninstalledAt     DateTime?
  onboardedAt       DateTime?
  storefrontToken   String?                   // app-scoped Storefront API token
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  filters           Filter[]
  filterGroups      FilterGroup[]
  collectionFilters CollectionFilter[]
  searchConfig      SearchConfiguration?
  settings          AppSettings?
  subscription      Subscription?
  usages            Usage[]
  suggestions       SearchSuggestion[]
  synonyms          SearchSynonym[]
  activity          ActivityLog[]
}

model FilterGroup {
  id          String   @id @default(cuid())
  shopId      String
  name        String
  handle      String
  position    Int      @default(0)
  enabled     Boolean  @default(true)
  defaultOpen Boolean  @default(true)
  collapsible Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  shop    Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  filters Filter[]

  @@unique([shopId, handle])
  @@index([shopId, enabled, position])
}

model Filter {
  id                String  @id @default(cuid())
  shopId            String
  groupId           String?
  name              String                    // merchant-facing label
  handle            String                    // stable key used in URLs/analytics
  source            String                    // FilterSource union — §8.1
  sourceKey         String?                   // option name, "namespace.key", etc.
  displayType       String                    // FilterDisplayType union — §8.2
  position          Int     @default(0)
  enabled           Boolean @default(true)
  multiSelect       Boolean @default(true)
  showCount         Boolean @default(true)
  hideEmpty         Boolean @default(true)
  collapsedByDefault Boolean @default(false)
  searchableValues  Boolean @default(false)
  maxVisibleValues  Int     @default(8)
  valueSort         String  @default("count")  // count | alpha | manual
  config            String  @default("{}")     // stringified JSON, type-specific
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  shop   Shop         @relation(fields: [shopId], references: [id], onDelete: Cascade)
  group  FilterGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  values FilterValue[]
  items  CollectionFilterItem[]

  @@unique([shopId, handle])
  @@index([shopId, enabled, position])
  @@index([shopId, source])
}

model FilterValue {
  id           String  @id @default(cuid())
  filterId     String
  value        String                       // raw storefront value
  label        String?                      // merchant override
  swatchColor  String?                      // #RRGGBB
  swatchImage  String?                      // Shopify Files CDN URL
  position     Int     @default(0)
  hidden       Boolean @default(false)
  cachedCount  Int?
  updatedAt    DateTime @updatedAt

  filter Filter @relation(fields: [filterId], references: [id], onDelete: Cascade)

  @@unique([filterId, value])
  @@index([filterId, position])
}

model CollectionFilter {
  id               String  @id @default(cuid())
  shopId           String
  collectionGid    String
  collectionHandle String
  title            String?
  enabled          Boolean @default(true)
  useDefault       Boolean @default(true)   // false = custom filter set below
  layout           String  @default("sidebar")
  settings         String  @default("{}")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  shop  Shop                   @relation(fields: [shopId], references: [id], onDelete: Cascade)
  items CollectionFilterItem[]

  @@unique([shopId, collectionGid])
  @@index([shopId, collectionHandle])
}

model CollectionFilterItem {
  id                 String  @id @default(cuid())
  collectionFilterId String
  filterId           String?
  groupId            String?
  position           Int     @default(0)
  enabled            Boolean @default(true)

  collectionFilter CollectionFilter @relation(fields: [collectionFilterId], references: [id], onDelete: Cascade)
  filter           Filter?          @relation(fields: [filterId], references: [id], onDelete: Cascade)

  @@index([collectionFilterId, position])
}

model SearchConfiguration {
  id               String  @id @default(cuid())
  shopId           String  @unique
  enabled          Boolean @default(true)
  placeholder      String  @default("Search products")
  minChars         Int     @default(2)
  debounceMs       Int     @default(250)
  maxSuggestions   Int     @default(6)
  showImages       Boolean @default(true)
  showPrices       Boolean @default(true)
  showVendors      Boolean @default(false)
  showProductTypes Boolean @default(false)
  showCollections  Boolean @default(true)
  showViewAll      Boolean @default(true)
  noResultsText    String  @default("No products found")
  updatedAt        DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
}

model SearchEvent {
  id               String  @id @default(cuid())
  shopId           String
  term             String
  normalizedTerm   String
  resultCount      Int
  collectionHandle String?
  kind             String  @default("search")  // search | predictive
  clickedProductId String?
  sessionHash      String?                     // salted hash, never raw PII
  locale           String?
  createdAt        DateTime @default(now())

  @@index([shopId, createdAt])
  @@index([shopId, normalizedTerm, createdAt])
  @@index([shopId, resultCount, createdAt])
}

model FilterEvent {
  id               String  @id @default(cuid())
  shopId           String
  filterHandle     String
  filterValue      String
  collectionHandle String?
  resultCount      Int
  sessionHash      String?
  createdAt        DateTime @default(now())

  @@index([shopId, createdAt])
  @@index([shopId, filterHandle, createdAt])
}

model SearchTermStat {
  id             String   @id @default(cuid())
  shopId         String
  day            DateTime                  // UTC midnight
  normalizedTerm String
  searches       Int      @default(0)
  zeroResults    Int      @default(0)
  clicks         Int      @default(0)

  @@unique([shopId, day, normalizedTerm])
  @@index([shopId, day])
}

model FilterUsageStat {
  id           String   @id @default(cuid())
  shopId       String
  day          DateTime
  filterHandle String
  filterValue  String
  uses         Int      @default(0)

  @@unique([shopId, day, filterHandle, filterValue])
  @@index([shopId, day])
}

model SearchSuggestion {
  id        String   @id @default(cuid())
  shopId    String
  term      String
  kind      String   @default("custom")   // custom | redirect | featured
  targetUrl String?
  position  Int      @default(0)
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, term, kind])
  @@index([shopId, enabled, position])
}

model SearchSynonym {
  id            String   @id @default(cuid())
  shopId        String
  term          String
  synonyms      String                    // stringified string[]
  bidirectional Boolean  @default(true)
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, term])
}

model AppSettings {
  id         String   @id @default(cuid())
  shopId     String   @unique
  general    String   @default("{}")
  appearance String   @default("{}")
  analytics  String   @default("{}")
  updatedAt  DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
}

model Subscription {
  id                String   @id @default(cuid())
  shopId            String   @unique
  plan              String   @default("free")   // free | standard | pro
  status            String   @default("active") // active | pending | cancelled | expired | frozen
  shopifyGid        String?
  test              Boolean  @default(false)
  trialEndsAt       DateTime?
  currentPeriodEnd  DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
}

model Usage {
  id                 String   @id @default(cuid())
  shopId             String
  periodKey          String                    // "YYYY-MM" UTC
  searches           Int      @default(0)
  filterInteractions Int      @default(0)
  updatedAt          DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, periodKey])
}

model ActivityLog {
  id         String   @id @default(cuid())
  shopId     String
  actor      String   @default("merchant")     // merchant | system | webhook
  action     String                            // filter.created, collection.updated, …
  entityType String?
  entityId   String?
  summary    String
  metadata   String   @default("{}")
  createdAt  DateTime @default(now())

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@index([shopId, createdAt])
}
```

### 5.3 Data rules

- **Shop isolation**: every model function signature starts with `shopId`. No route may read a
  shop identifier from the request body or query — it comes from the authenticated session or the
  verified app-proxy signature only.
- **Cascade**: uninstall soft-deletes (`Shop.uninstalledAt`), a scheduled job hard-deletes after
  the retention window; GDPR webhooks hard-delete on demand.
- **Retention**: raw `SearchEvent` / `FilterEvent` pruned after 90 days (configurable); rollups kept
  for 24 months.
- **Rollups**: written on a short interval (or on write, in a transaction) — never computed
  on-demand for the dashboard.

---

## 6. Shopify integration

### 6.1 Access scopes

Target set (replace the template's demo scopes):

```text
read_products              # products, variants, options, collections, product metafields
read_inventory             # availability filtering
unauthenticated_read_product_listings
unauthenticated_read_product_tags
unauthenticated_read_collection_listings
unauthenticated_read_product_inventory
```

Remove `write_metaobjects` and `write_metaobject_definitions` (demo-only). Keep `write_products`
only if a feature genuinely writes products — currently none does.

> Verify the exact scope names and their coverage against current Shopify docs using the
> **Shopify AI Toolkit / `shopify-dev-mcp`** when implementing Phase 2 and Phase 7. Do not assume.

### 6.2 API versions

Reconcile `ApiVersion` in `app/shopify.server.ts`, `.graphqlrc.js`, and
`[webhooks] api_version` in `shopify.app.toml` to a **single pinned version**. Bump deliberately,
never per-file.

### 6.3 App proxy

Add to `shopify.app.toml`:

```toml
[app_proxy]
url = "https://<app-host>/proxy"
subpath = "scfs"
prefix = "apps"
```

Storefront path `/apps/scfs/<x>` → app route `proxy.<x>.tsx`.
Every proxy route begins with `authenticate.public.appProxy(request)`; the shop is taken from the
verified result. Unsigned or mismatched requests get `401` with no body detail.

### 6.4 Endpoint contract

| Route | Method | Purpose | Notes |
| --- | --- | --- | --- |
| `/apps/scfs/config` | GET | Filter + search config for a collection/context | ETag + `Cache-Control` |
| `/apps/scfs/products` | GET | Filtered/sorted/paginated products + facets + counts | Engine App only |
| `/apps/scfs/suggest` | GET | Predictive search with synonyms/redirects applied | Tier 2 only |
| `/apps/scfs/events` | POST | Batched analytics events | `sendBeacon`, rate-limited |

`/apps/scfs/products` response shape:

```jsonc
{
  "products": [{ "id", "title", "handle", "url", "image", "hoverImage", "price",
                 "compareAtPrice", "currency", "available", "badges": ["sale"],
                 "rating": { "value": 4.5, "count": 12 },
                 "options": [{ "name": "Size", "values": ["34","35"] }],
                 "swatches": [{ "value": "Black", "color": "#000" }] }],
  "pagination": { "page": 1, "perPage": 24, "totalPages": 5, "hasNext": true },
  "totalCount": 108,
  "facets": [{ "handle", "label", "displayType", "groupHandle",
               "values": [{ "value", "label", "count", "active", "swatch" }],
               "range": { "min": 45, "max": 83, "selectedMin": null, "selectedMax": null } }],
  "activeFilters": [{ "handle", "value", "label", "removeParams" }],
  "meta": { "engine": "app", "cached": true, "tookMs": 42 }
}
```

### 6.5 Webhooks

| Topic | Handler | Action |
| --- | --- | --- |
| `app/uninstalled` | exists | Mark `Shop.uninstalledAt`, purge sessions, stop metering |
| `app/scopes_update` | exists | Update stored scopes |
| `products/update` | new | Invalidate cached facets/counts for affected collections |
| `products/delete` | new | Invalidate caches, prune `FilterValue.cachedCount` |
| `collections/update` | new | Invalidate collection config cache |
| `collections/delete` | new | Delete or orphan the `CollectionFilter` |
| GDPR mandatory topics | new | `customers/data_request`, `customers/redact`, `shop/redact` |

All webhook routes verify HMAC via `authenticate.webhook(request)`, are **idempotent**, and return
`200` quickly (queue heavy work).

In `shopify.app.toml` the three GDPR topics are declared with **`compliance_topics`**, not `topics`
— under `topics` Shopify rejects them with "The following topic is invalid: customers/data_request".

### 6.6 Metafield filters

Admin flow: select data source → namespace → key → detect type → choose UI → validate → save.

Validation rules:

- Read definitions via Admin GraphQL `metafieldDefinitions(ownerType: PRODUCT | PRODUCTVARIANT)`.
- Type → allowed display types:
  `single_line_text_field` → checkbox / radio / dropdown / swatch;
  `list.single_line_text_field` → checkbox / dropdown / swatch;
  `boolean` → boolean;
  `number_integer` / `number_decimal` / `dimension` / `weight` → range / range slider;
  `rating` → rating.
- A metafield is only usable as a storefront filter if it is **filterable** (Search & Discovery /
  filterable definition capability). Surface a clear, actionable warning in the builder when it is
  not, with a link to enable it — do not silently create a broken filter.

### 6.7 Billing

Use the adapter's billing API (`authenticate.admin` → `billing.check` / `request` / `cancel`).
Plans, prices, trial lengths, and quota limits are defined **only** in `app/config/plans.server.ts`
and mirrored into `Subscription` / `Usage`. Enforcement is server-side.

---

## 7. Storefront rendering engines

Two engines share the same URL grammar, filter config, chips, drawer, and analytics.

### Engine Native (default when compatible)

- Filter interactions rewrite the URL with Shopify's native `filter.*` params.
- Results are refreshed with the **Section Rendering API** (`?section_id=<collection section>`), so
  product cards are rendered by the merchant's own theme.
- Facet values and counts come from Liquid `collection.filters` on first paint.
- Cost: **zero** app API calls per interaction. Best performance, perfect theme fidelity.
- Constraint: usable only when **every** active filter maps 1:1 to a native Shopify storefront
  filter. The admin marks non-native filters clearly.

### Engine App

- Filter interactions call `/apps/scfs/products`; the app queries the **Storefront API**
  server-side and returns JSON; the extension renders cards from `scfs-product-card`.
- Required for: cross-collection search results pages, synonyms, app-computed facets, custom card
  layouts, per-collection ordering that native filtering cannot express.
- Caching: in-memory LRU + short-TTL persisted cache keyed by
  `(shop, context, filterSignature, sort, page, perPage, locale, currency)`, invalidated by product
  and collection webhooks.

Engine selection: `AppSettings.general.engine = "auto" | "native" | "app"`, default `auto`
(= native when compatible, otherwise app). The chosen engine is reported in `meta.engine` and
surfaced in the admin so merchants understand the trade-off.

---

## 8. Filter system specification

### 8.1 Filter sources

| Source key | Shopify data | Native filterable |
| --- | --- | --- |
| `product_option` | Product/variant option (Color, Size, …) | yes |
| `variant_option` | Variant-level option | yes |
| `vendor` | Product vendor | yes |
| `product_type` | Product type | yes |
| `tag` | Product tags | yes |
| `collection` | Collection membership ("Shop by Category") | partial |
| `price` | Variant price range | yes |
| `availability` | In stock / out of stock | yes |
| `product_metafield` | `namespace.key` on product | if definition is filterable |
| `variant_metafield` | `namespace.key` on variant | if definition is filterable |
| `rating` | Rating-type metafield (e.g. `reviews.rating`) | if filterable |
| `title` | Product title contains (search-assist) | no (Engine App) |

The registry lives in `app/config/filter-types.ts`. Adding a source must require only: a registry
entry, a query mapper, and a URL-grammar mapping — nothing else.

### 8.2 Display types

| Display type | Behaviour |
| --- | --- |
| `checkbox` | Multi-select, OR within filter, counts shown |
| `radio` | Single-select |
| `dropdown` | Single or multi via a `<select>` / listbox |
| `range` | Two numeric inputs (min/max) |
| `range_slider` | Dual-handle slider + numeric inputs, keyboard accessible |
| `color_swatch` | Circular swatches from `FilterValue.swatchColor`, with tooltip + label |
| `image_swatch` | Image tiles from `FilterValue.swatchImage` + label |
| `rating` | Star rows, "N stars & up" semantics |
| `boolean` | Single toggle/checkbox (In Stock, On Sale, Ready to Ship) |
| `button` / `tag_pill` | Pill list (used for tags and sizes) |

### 8.3 Combination semantics

- **Within** one filter: `OR` (Black **or** White).
- **Across** filters: `AND` (Black **and** size 40).
- Range filters: inclusive `AND` bounds.
- Search term `q` is `AND`-combined with all filters.
- Counts shown next to a value reflect the result set **with all other filters applied** but that
  filter's own selections relaxed (standard facet behaviour), when the data source can express it;
  otherwise counts are absolute and the admin says so.

### 8.4 Filter groups

Collapsible sections containing filters. Merchants can create, rename, delete, enable/disable,
reorder (drag-and-drop), set collapsible, and set default open/closed. Filters without a group
render at root level, ordered by `position`.

### 8.5 Collection-specific filters

`CollectionFilter.useDefault = true` → the shop default filter set. `false` → the explicit
`CollectionFilterItem` list, ordered. Unknown/unconfigured collections always fall back to default.
The search results page uses the default set unless a dedicated search configuration exists.

---

## 9. URL synchronization

Canonical grammar mirrors Shopify (**D10**). Multi-select repeats the key.

| Concern | Parameter | Example |
| --- | --- | --- |
| Search term | `q` | `q=running+shoes` |
| Product option | `filter.v.option.<option>` | `filter.v.option.color=Black` |
| Availability | `filter.v.availability` | `=1` (in stock) / `=0` |
| Price | `filter.v.price.gte` / `.lte` | `filter.v.price.gte=45` |
| Vendor | `filter.p.vendor` | `=Nike` |
| Product type | `filter.p.product_type` | `=Sneakers` |
| Tag | `filter.p.tag` | `=Glitter` |
| Product metafield | `filter.p.m.<ns>.<key>` | `filter.p.m.custom.material=Cotton` |
| Variant metafield | `filter.v.m.<ns>.<key>` | `filter.v.m.custom.width=Wide` |
| Rating | `filter.p.m.reviews.rating.gte` | `=4` |
| Sort | `sort_by` | `=price-ascending` |
| Page | `page` | `=2` |
| Per page | `limit` | `=24` |

Requirements: refresh preserves state; back/forward work (`pushState` for changes, `popstate`
restores); URLs are shareable; state is rehydrated from the URL on load before first paint of the
sidebar. Any filter change resets `page` to 1. `limit` and `sort_by` persist across filter changes.

Unknown parameters are ignored, not echoed back. All values are validated and clamped server-side.

---

## 10. Storefront UI specification

### 10.1 Layout

```text
┌──────────────────────── Store header (theme) ─────────────────────────┐
└───────────────────────────────────────────────────────────────────────┘
                         Products
                       Home / Shop
┌───────────────────────── Search products ─────────────────────────────┐
└───────────────────────────────────────────────────────────────────────┘
┌────────────────┬──────────────────────────────────────────────────────┐
│ FILTER SIDEBAR │  10 Products      [Clear All]   Show [24▼] Sort [▼]   │
│  Category      │  [chip ×] [chip ×]                                    │
│  Price         │  ┌────────┐ ┌────────┐ ┌────────┐                     │
│  Size          │  │ card   │ │ card   │ │ card   │                     │
│  Color         │  └────────┘ └────────┘ └────────┘                     │
│  Tag           │  ┌────────┐ ┌────────┐ ┌────────┐                     │
│  Availability  │  │ card   │ │ card   │ │ card   │                     │
│  Rating        │  └────────┘ └────────┘ └────────┘                     │
│                │             ‹ 1 2 3 ›  /  [Load more]                 │
└────────────────┴──────────────────────────────────────────────────────┘
```

Breakpoints: `< 750px` mobile (drawer), `750–989px` tablet (drawer or collapsed sidebar),
`≥ 990px` desktop (sidebar). Grid columns configurable 2–5, auto-reducing on narrow viewports.

### 10.2 Sidebar sections

Each section is an accordion with a heading, optional count, and merchant-set default state.
Reference arrangement (all optional and merchant-defined):

```text
SHOP BY CATEGORY   ○ Heels (1)  ○ Mules (3)  ○ Pumps (3) …
HEEL HEIGHT        ○ High (3)  ○ Low (2)  ○ Medium (5)
SIZE               [34] – [41]   ────○────○────
COLOR              ● ● ● ● ●  ● ● ● ● ●  ●
SHOE TYPE          [img] Party  [img] Wedding  [img] Workwear
TAG                [Flats (1)] [Glitter (1)] [Heels (1)]
AVAILABILITY       ○ In Stock (9)  ○ Out of Stock (1)
PRICE              [45] – [83]   ────○────○────
REVIEW RATINGS     ★★★★★ / ★★★★☆ / ★★★☆☆ / ★★☆☆☆ / ★☆☆☆☆
```

Long value lists collapse to `maxVisibleValues` with "Show more"; `searchableValues` adds an
in-section filter input.

### 10.3 Toolbar

Product count · Clear All · active filter chips · `Show [12|24|36|48]` · `Sort [ … ]`.
Each element individually toggleable by the merchant. Count updates on every result change and is
announced via an `aria-live="polite"` region.

### 10.4 Active filter chips

One chip per selected value, labelled `<Filter>: <Value>` with an `×` control; range filters render
as a single chip (`Price: $45 – $83`). A `Clear All` control appears when ≥1 filter is active.
Chips are keyboard-focusable buttons with accessible names.

### 10.5 Product card

Image, hover image, title, price, compare-at price, sale badge, sold-out badge, rating, variant
options (size pills), colour swatches, optional quick add and quick view. Every element toggleable
in the theme extension settings. Images use `srcset` + `loading="lazy"` + explicit aspect ratio to
avoid layout shift.

### 10.6 Sorting

| Label | `sort_by` |
| --- | --- |
| Featured | `manual` |
| Best selling | `best-selling` |
| Alphabetically, A–Z | `title-ascending` |
| Alphabetically, Z–A | `title-descending` |
| Price, low to high | `price-ascending` |
| Price, high to low | `price-descending` |
| Newest | `created-descending` |
| Oldest | `created-ascending` |
| Relevance (search only) | `relevance` |

### 10.7 Pagination

Numbered pages with prev/next, or **Load more**, merchant's choice. Filter changes reset to page 1.
Numbered mode keeps real `<a href>` links for crawlability and no-JS fallback.

### 10.8 Mobile

Sticky `[ Filter (n) ] [ Sort ]` bar. Filter opens a drawer with scroll, collapsible groups, active
count, Clear all, **Apply filters**, and a close button. Focus is trapped while open, body scroll is
locked, `Esc` closes, and focus returns to the trigger. Sort opens a native-feeling sheet.

### 10.9 Accessibility

WCAG 2.1 AA: keyboard operable throughout, visible focus rings, correct roles
(`group`/`checkbox`/`radio`/`slider`), `aria-expanded` on accordions, `aria-live` for result
counts, swatches never colour-only (always a text label or accessible name), 4.5:1 contrast.

---

## 11. Search specification

### 11.1 Product search field

Placed above results. Debounced (`SearchConfiguration.debounceMs`, default 250 ms), minimum
characters (default 2), combines with active filters, sorting, and pagination. Shows loading,
no-results, and error states. Submitting with Enter performs a full search.

### 11.2 Predictive search

```text
Products
  iPhone 15
  iPhone 15 Pro
  iPhone Case
Collections
  iPhone Accessories
Search for "iph"
```

- **Tier 1** (default): the theme's native `/search/suggest.json` — no app request, no metering.
- **Tier 2** (synonyms / redirects / custom suggestions enabled, Standard+): `/apps/scfs/suggest`,
  which expands synonyms, injects custom suggestions, applies redirects, then queries the
  Storefront API server-side and caches by normalised term.
- Keyboard: ↑/↓ navigate, Enter selects, Esc closes; combobox roles and `aria-activedescendant`.
- Requests are aborted when superseded; results applied only if the sequence number is current.

### 11.3 Search configuration (merchant)

Enable/disable · placeholder · minimum characters · debounce delay · maximum suggestions · show
product images / prices / vendors / product types / collections · show "View all results" ·
no-results message.

### 11.4 Synonyms, suggestions, redirects

`SearchSynonym` supports one-way and bidirectional sets (`Sneakers → Shoes`, `Mobile → Phone`).
`SearchSuggestion` supports custom suggestions, redirects (term → URL), and featured terms.
Expansion happens server-side in `synonym.service.ts`; the initial implementation may be a simple
normalised-term map, but the service boundary must allow richer strategies later without touching
callers.

---

## 12. Theme App Extension

Extension handle: `stable-custom-filter`. Generate with `npm run generate` (Theme app extension).

### 12.1 Blocks

| Block | Type | Purpose |
| --- | --- | --- |
| `filter-sidebar` | app block | Configured filters (sidebar / horizontal / dropdown / accordion) |
| `product-search` | app block | Search input + predictive dropdown |
| `filter-search` | app block | Filters and search together |
| `active-filters` | app block | Active filter chips + Clear All |
| `filter-toolbar` | app block | Count, Clear All, sort, per-page |
| `product-results` | app block | Product grid (Engine App / custom cards) |
| `app-embed` | app embed | Global bootstrap: config JSON, styles, predictive search on the theme header |

App blocks require an Online Store 2.0 section that supports `@app` blocks. The Help page must
explain where to add each block and what to do on themes that do not support them.

### 12.2 Settings (schema)

Layout (`sidebar`/`horizontal`/`dropdown`/`drawer`/`accordion`) · filter position (left/right) ·
filter spacing · filter title · columns (2–5) · show product counts · show clear button · show
active filters · enable search · enable sort · show product count · mobile drawer on/off ·
product card options (hover image, badges, rating, swatches, quick add) · colour and radius tokens ·
custom CSS escape hatch.

Settings resolve in this order: **theme block setting → collection config → shop AppSettings →
defaults**. Document this precedence in the block schema help text.

Schema constraint: a `range` setting must span **at least 3 steps** (`(max - min) / step + 1 >= 3`),
otherwise the extension fails to bundle. Two-value choices use `select` instead — which is why
`columns_mobile` is a select of `"1"` / `"2"`; the CSS matches on the attribute string either way.

### 12.3 Storefront assets

**Built** artifacts (committed, produced by `npm run build:extension`):

| Asset | Contents |
| --- | --- |
| `assets/scfs.js` | One bundle: context, URL codec, store, facet/result rendering, search, drawer, analytics |
| `assets/scfs.css` | Hand-authored; CSS custom properties driven by block settings |

Source lives in **`extension-src/*.ts`** (repo root) and imports `app/lib/filter-url.ts` directly,
so codec parity is guaranteed by the bundler rather than by a sync check. The source is deliberately
**outside** the extension folder: Shopify's theme-extension bundler rejects any directory other than
`assets`, `blocks`, `snippets`, and `locales`, so a `src/` inside the extension fails `shopify app
dev` with "Only assets, blocks, snippets, locales directories are allowed".

> **Deviation from the original three-file plan** (`scfs-core.js` / `scfs-filters.js` /
> `scfs-search.js`): a single bundle is one request instead of three and lets the shared codec be
> deduplicated. The budget check in `scripts/build-extension-assets.mjs` enforces §17 and fails the
> build when exceeded. Vanilla ES modules, no framework, no jQuery, `defer`, no render-blocking CSS.

### 12.4 First paint and progressive enhancement

`snippets/scfs-native-filters.liquid` renders Shopify's own `collection.filters` server-side, so the
sidebar is usable before `scfs.js` runs and keeps working with JavaScript disabled. The runtime then
replaces that markup with the merchant-configured version (labels, swatches, ordering, groups).

Merchant presentation config is **not** available to Liquid at render time — mirroring it into an
app-owned shop metafield would remove the swap entirely and is recorded as a Phase 18 optimisation.

---

## 13. Admin application

Navigation: **Dashboard · Filters · Filter Groups · Collections · Search · Analytics · Settings ·
Pricing · Help**. Polaris **web components** only (**D2**).

### 13.1 Dashboard

Overview cards (total filters, active filters, filter groups, configured collections, total
searches, filter interactions) · Top Searches · Top Filters · Recent Activity (from `ActivityLog`) ·
usage meters · onboarding checklist for first-run.

### 13.2 Filters

```text
Filters                                              [+ Create Filter]
──────────────────────────────────────────────────────────────────────
Name     Type       Source     Group     Status    Actions
Brand    Checkbox   Vendor     Product   Active    Edit Duplicate Delete
Color    Swatch     Option     Style     Active    …
Size     Checkbox   Option     Style     Active    …
Price    Range      Price      —         Active    …
Rating   Rating     Metafield  Reviews   Draft     …
──────────────────────────────────────────────────────────────────────
```

Actions: edit, duplicate, delete (with confirmation), enable/disable, drag-to-reorder, bulk
enable/disable/delete, search and filter the list. Empty state offers "Create your first filter"
plus one-click starter presets (Color, Size, Price, Availability, Tag).

### 13.3 Filter builder

Stepped form: **Name → Data source → Source key → Display type → Values → Behaviour → Preview**.
Behaviour options: show product count, hide empty values, multi-select, collapsed by default,
searchable values, max visible values, value sort. Values tab manages `FilterValue` overrides:
label, swatch colour, swatch image (Files picker), order, hide. A live preview renders the actual
storefront markup. Invalid combinations are blocked with an inline reason, never a silent failure.

### 13.4 Collections

List shop collections (Admin GraphQL, paginated, searchable). Per collection: use default or
custom, pick filters/groups, reorder, per-collection layout and title overrides.

### 13.5 Search / Analytics / Settings / Pricing / Help

- **Search**: configuration form, synonyms table, suggestions/redirects table.
- **Analytics**: see §14.
- **Settings**: general (engine, storefront behaviour), filters, search, appearance, analytics
  (tracking on/off, retention), data (export/reset).
- **Pricing**: plan comparison from `plans.server.ts`, current plan, upgrade/downgrade, usage.
- **Help**: setup guide, block placement, theme compatibility, troubleshooting, contact.

---

## 14. Analytics

### 14.1 Tracked events

**Search** — term, normalised term, timestamp, result count, kind (search/predictive), collection
context, clicked product, zero-result flag, session hash, locale.
**Filter** — filter handle, value, collection, timestamp, resulting count, session hash.

Events are batched client-side, flushed on idle/unload via `navigator.sendBeacon` to
`/apps/scfs/events`, HMAC-verified, size- and rate-limited. The **shop is derived from the verified
proxy signature**, never from the payload. No PII: session identifiers are salted hashes.

### 14.2 Dashboard

Search statistics (total searches, today, this month, top keywords, zero-result searches,
click-through rate) and filter statistics (total interactions, most-used filters, most-selected
values, most-filtered collections). Cards, charts, and tables with date ranges: Today, Last 7 days,
Last 30 days, This month, Custom. Charts are dependency-free inline SVG.

### 14.3 Zero-result searches

Dedicated table (term, searches, last seen) with CSV export, sourced from `SearchTermStat`.
Each row links to "create a synonym" or "add a redirect" so the insight is actionable.

---

## 15. Pricing, billing, usage

| Plan | Price | Includes |
| --- | --- | --- |
| **Free** | $0/mo | Basic filters, basic search, basic analytics, limited configuration |
| **Standard** | $19/mo | Advanced filters, metafield filters, predictive search (Tier 2), collection-specific filters, advanced analytics, more customization |
| **Pro** | $49/mo | Unlimited filters, advanced search, full analytics, synonyms, suggestions, advanced customization, priority support |

Prices, quotas, trial length, and feature flags live **only** in `app/config/plans.ts`
(**D11**). The module is deliberately **not** `.server`: it holds public pricing and pure functions,
and the pricing page renders plan names client-side. React Router only strips server code from
`loader`/`action`/`headers`/`middleware`, so a `.server` module referenced by a component breaks the
client build. Enforcement still happens server-side, in loaders/actions and the model layer.
Usage (`searches`, `filterInteractions`) is metered per `YYYY-MM` in `Usage`, incremented
atomically server-side, and shown as meters in the admin:

```text
Monthly Usage
Searches               4,120 / 10,000
Filter Interactions    2,450 / 10,000
```

**Degradation rule**: exceeding a quota must never break the storefront. Over quota, the app stops
recording analytics and disables premium enhancements (Tier 2 predictive search, app-computed
facets) while core filtering keeps working, and the admin shows an upgrade prompt.

---

## 16. Security requirements

- Authenticate every admin request (`authenticate.admin`), every proxy request
  (`authenticate.public.appProxy`), every webhook (`authenticate.webhook`).
- Resolve `shopId` **only** from verified authentication context. Reject any request that tries to
  supply it.
- Every model function is shop-scoped; a cross-shop access test exists per service.
- Validate and clamp all inputs with zod (page ≤ 500, perPage ∈ allowed set, term length ≤ 128,
  filter values ≤ 64 per request).
- Escape all merchant-authored strings rendered in Liquid/HTML; swatch colours must match
  `^#[0-9a-fA-F]{6}$`; image URLs must be on the Shopify CDN.
- Secrets in environment variables only; never sent to the client or logged.
- Rate-limit proxy endpoints per shop and per session hash.
- No secrets, tokens, or shop-identifying data in storefront JS beyond the shop's own public
  context.

---

## 17. Performance requirements

| Budget | Target |
| --- | --- |
| Extension JS (core, gzipped) | ≤ 12 KB |
| Extension JS total (gzipped) | ≤ 25 KB |
| Extension CSS (gzipped) | ≤ 8 KB |
| Filter interaction → painted results | ≤ 400 ms p75 (Native), ≤ 700 ms p75 (App) |
| Predictive search response | ≤ 250 ms p75 |
| Added CLS on collection pages | 0 |
| Shopify API calls per filter interaction | 0 (Native) / 1 (App, cache miss), 0 on cache hit |

Rules: never ship the catalog to the browser; debounce search; abort superseded requests; cache
facets and config server-side; paginate everything; lazy-load images; keep scripts `defer`red and
off the critical path; verify with a seeded 10k-product dev store before any phase is marked done.

---

## 18. Testing strategy

| Layer | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | URL codec (round-trip property tests), facet merge, synonym expansion, plan/quota gating, validators, sort mapping |
| Component | Vitest + Testing Library | Admin components, states (loading/empty/error) |
| Route | Vitest | Loaders/actions called directly with mocked `authenticate` |
| Integration | Vitest + test Prisma DB | Model services, rollups, cascade deletes, **cross-shop isolation** |
| Contract | Vitest + MSW | Shopify GraphQL request/response shapes; proxy HMAC accept/reject |
| E2E | Playwright | Storefront scenarios against a dev store with a seeded catalog |
| Performance | CI size check + Lighthouse | Asset budgets, collection-page vitals |

**E2E scenario list** (Phase 17 must cover all): authentication; filter CRUD; groups; collection
filters; metafield filters; search; predictive search; multiple simultaneous filters; price range;
color swatches; image swatches; rating; availability; sorting; pagination and load-more; AJAX
filtering; URL synchronization incl. refresh/back/forward/share; mobile drawer; analytics recording;
billing upgrade/downgrade; usage limits and degradation; install / uninstall / reinstall.

CI gates: `npm run typecheck`, `npm run lint`, `vitest run`, asset-size check. A phase is not
complete until its gates pass.

---

## 19. Development phases

Each phase lists deliverables and the acceptance criteria that let it be checked off.
**Do not check a phase until every criterion is verified.**

### Phase 1 — Project setup
Deliverables: remove template demo artifacts; migrate `app/**` to TypeScript; reconcile API version;
review scopes; add zod + test tooling; base directory structure (`services/`, `models/`, `lib/`,
`config/`, `components/`); `.env.example`; scripts (`test`, `build:extension`); Git hygiene.
Accept: `npm run typecheck` and `npm run lint` clean; `shopify app dev` boots; no `.jsx` left in
`app/`; no demo route or demo metafield/metaobject config remains.

### Phase 2 — Authentication
Deliverables: typed `shopify.server.ts`; `Shop` upsert on install/first load; protected route
helper; app-proxy auth helper; webhook auth; uninstall handling.
Accept: unauthenticated admin request redirects; forged proxy signature rejected; `Shop` row created
on install and marked on uninstall; tests cover all three.

### Phase 3 — Database
Deliverables: full schema (§5), migrations, indexes, seed script, model layer with shop-scoped APIs,
retention/prune job.
Accept: migration applies clean from empty; cross-shop isolation tests pass for every model;
cascade deletes verified.

### Phase 4 — Admin dashboard
Deliverables: app shell + nav, dashboard cards, top searches, top filters, recent activity, usage
meters, onboarding checklist.
Accept: renders with real data and with zero data (empty states); loading and error states present.

### Phase 5 — Filter builder
Deliverables: filter CRUD, all display types, groups CRUD, drag-and-drop ordering, enable/disable,
duplicate, value overrides, live preview.
Accept: each display type can be created, saved, reloaded, and previewed; ordering persists;
validation blocks invalid source/display combinations.

### Phase 6 — Collection filters
Deliverables: collection listing from Admin API, per-collection configuration, filter/group
assignment and ordering, default fallback.
Accept: a collection with custom config resolves to it; one without falls back to default; verified
on the storefront.

### Phase 7 — Metafields
Deliverables: definition loader, namespace/key picker, type detection, compatible-UI mapping,
filterability validation, metafield filter creation.
Accept: a filterable product metafield produces a working storefront filter; a non-filterable one
produces a clear warning instead of a broken filter.

### Phase 8 — Theme extension
Deliverables: extension scaffold, all blocks (§12.1), settings schemas, locales, asset pipeline
including the codec sync check.
Accept: blocks appear in the theme editor, can be added to an OS 2.0 collection page, and render
with settings applied; codec parity test passes.

### Phase 9 — Storefront UI
Deliverables: search bar, sidebar, product grid, count, sort, per-page, active filters, Clear All,
product cards, badges, prices, variant options.
Accept: matches §10 on desktop/tablet/mobile; axe reports no serious/critical issues.

### Phase 10 — Filtering engine
Deliverables: both engines (§7); checkbox, radio, dropdown, price, range, colour, image swatch,
rating, availability, boolean; multi-filter combination; facet counts; AJAX updates.
Accept: all types filter correctly alone and combined; counts correct; no full page reloads; stale
responses discarded.

### Phase 11 — Search
Deliverables: product search, predictive search (both tiers), debouncing, suggestions, synonyms,
redirects, no-result handling.
Accept: search combines with filters/sort/pagination; predictive keyboard-navigable; synonyms and
redirects work; zero-result state rendered and recorded.

### Phase 12 — Sorting & pagination
Deliverables: all sort options, numbered pagination, load more, per-page selector, full URL sync.
Accept: refresh/back/forward/share all restore exact state; filter change resets to page 1.

### Phase 13 — Mobile
Deliverables: filter/sort bar, drawer with focus trap and scroll lock, active count, clear, apply,
responsive grid.
Accept: verified on real iOS Safari and Android Chrome; no body-scroll bleed; focus returns to
trigger on close.

### Phase 14 — Analytics
Deliverables: event capture and batching, proxy ingest, rollups, dashboard, zero-result report,
date ranges, CSV export.
Accept: events recorded end-to-end; rollups match raw counts; dashboard queries stay under 200 ms on
a seeded dataset.

### Phase 15 — Pricing & usage
Deliverables: pricing page, Shopify billing flow, subscription webhooks/state, quota enforcement,
usage dashboard, degradation behaviour.
Accept: upgrade, downgrade, and cancel all work on a dev store; over-quota degrades without breaking
the storefront.

### Phase 16 — Settings
Deliverables: general, filter, search, appearance, and analytics settings with the §12.2 precedence
chain.
Accept: every setting demonstrably changes storefront or admin behaviour; precedence verified.

### Phase 17 — Testing
Deliverables: full suite per §18, CI wiring, coverage reporting.
Accept: every E2E scenario in §18 implemented and green.

### Phase 18 — Performance
Deliverables: API-call audit, GraphQL query tuning, DB query/index review, JS/CSS budget
enforcement, caching, large-catalog verification.
Accept: every budget in §17 met on a 10k-product store.

### Phase 19 — Production
Deliverables: production Postgres, production app config, billing live, all webhooks incl. GDPR,
env management, security review, performance review, install/uninstall/reinstall testing, App Store
listing assets.
Accept: clean install → configure → uninstall → reinstall cycle with no orphaned or leaked data;
security and performance reviews signed off in this file.

---

## 50. Progress Tracking

> Update this section after every meaningful change. Keep it honest — partial work stays unchecked.

### Overall Progress

**~70% — end-to-end app implemented and verified locally; not yet exercised against a real dev store**

Gates currently green: `npm run typecheck`, `npm run lint`, `npm test` (109 tests, 6 files),
`npm run build`, `npm run build:extension` (asset budgets enforced).

### Current Phase

**Phase 17 — Testing** (unit + integration done; E2E outstanding)

### Current Task

**Run the app against a real development store: install, add the theme blocks to a collection page,
and walk the §18 E2E scenario list. Everything below marked "unverified on a store" needs that pass.**

### Phase Progress

* [x] Phase 1 — Project Setup
* [x] Phase 2 — Authentication
* [x] Phase 3 — Database
* [x] Phase 4 — Admin Dashboard
* [x] Phase 5 — Filter Builder
* [x] Phase 6 — Collection Filters
* [x] Phase 7 — Metafields *(with a documented limitation — see Known Issues #1)*
* [x] Phase 8 — Theme Extension *(authored; not yet rendered in a real theme editor)*
* [ ] Phase 9 — Storefront UI *(built; §10 visual + axe pass on a store outstanding)*
* [ ] Phase 10 — Filtering Engine *(both engines built; correctness on a real catalogue unverified)*
* [ ] Phase 11 — Search *(built; both predictive tiers unverified on a store)*
* [x] Phase 12 — Sorting & Pagination
* [ ] Phase 13 — Mobile *(drawer built; real iOS Safari / Android Chrome pass outstanding)*
* [x] Phase 14 — Analytics
* [x] Phase 15 — Pricing & Usage *(billing flow unverified against a dev store)*
* [x] Phase 16 — Settings
* [ ] Phase 17 — Testing *(unit/integration done; E2E not started)*
* [ ] Phase 18 — Performance *(budgets enforced in the build; 10k-product store not yet measured)*
* [ ] Phase 19 — Production

### Completed Features

**Foundation**

* TypeScript migration of all of `app/**` — no `.jsx`/`.js` left. `strict` passes.
* Template demo artifacts removed (`app.additional`, the product/metaobject mutation, the demo
  metafield/metaobject TOML blocks, `.DS_Store` files).
* API version pinned to **2026-07** across `app/shopify.server.ts`, `.graphqlrc.js` and
  `shopify.app.toml`. (`July26` is the newest the installed SDK exposes; the TOML's `2026-10` did
  not exist in the library at all.)
* Scopes replaced with the real set: `read_products`, `read_inventory` and the four
  `unauthenticated_read_*` scopes the Storefront client needs.
* App proxy configured: `/apps/scfs/*` → `proxy.*.tsx`.
* `zod` + `vitest` + Testing Library + `jsdom` installed; `test`, `build:extension` and `check`
  scripts added. `.env.example` documented and un-ignored.

**Database** — full schema (18 models), two migrations, every index and unique constraint from §5.
Shop-scoped model layer in `app/models/`. `FilterUsageStat` carries `collectionHandle` as an empty
string rather than NULL, because SQLite treats NULLs as distinct in unique constraints, which would
have broken the upsert-increment rollup.

**Auth & webhooks** — `requireAdminContext` / `requireProxyContext`; `ensureShop` upsert with
idempotent singleton provisioning; soft-delete on uninstall that a re-install restores; 9 webhook
routes including all three mandatory GDPR topics.

**Storefront engine** — `proxy.config` (ETag + max-age), `proxy.products`, `proxy.suggest`,
`proxy.events`. Storefront API queries with real facet counts, `buildProductFilters` mapping,
`deriveTotalCount`, cursor-walking for numbered pages, LRU+TTL caching with webhook invalidation,
and token-bucket rate limiting.

**Theme extension** — 7 blocks plus the app embed, 2 snippets, locales, `scfs.js` (10.2 KB gzipped)
and `scfs.css` (3.9 KB gzipped), both inside budget. Server-rendered no-JS fallback built from
`collection.filters`.

**Admin** — 12 routes: dashboard, filter list and builder (all 10 display types, value overrides),
groups, collections list and per-collection configuration, search configuration with synonyms and
redirects, analytics with sparkline and CSV export, settings (general/appearance/analytics plus
prune), pricing with real Shopify billing, and help.

**Tests** — 109 passing across the URL codec (round-trip, clamping, injection), facet merge, filter
mapping and count derivation, plan gating and validators, the proxy helpers (session hashing, rate
limiting, cache headers, ETag/304), and a 24-case cross-shop isolation suite run against a real
SQLite database.

### Current Implementation

A complete vertical slice: merchant configures filters in the admin → configuration and facets are
served over the app proxy → theme blocks render and filter without a page reload → interactions are
recorded and rolled up → the dashboard reads the rollups → plan limits gate features and degrade
without breaking the storefront.

### Next Task

1. `npm run dev`, install on a development store, enable the app embed and add **Product filters** to
   the collection template.
2. Walk the §18 E2E list; add Playwright specs as each scenario is confirmed.
3. Seed roughly 10k products and measure the §17 budgets (Phase 18).
4. Then Phase 19: switch `provider` to `postgresql`, regenerate migrations, security review.

### Known Issues

1. **Metafield storefront-filterability cannot be detected.** The Admin API does not expose whether a
   metafield definition is enabled as a *storefront* filter (`adminFilterable` is a different
   capability). The builder reports `storefrontFilterable: "unknown"` and shows an actionable warning
   pointing at Search & Discovery, upgrading to "yes" only once the definition has actually been
   observed in a facet response. §6.6's "surface a clear warning" is met; automatic detection is not
   possible with the current API.
2. **Collection product totals are not always exact.** `collection.products` has no `totalCount`.
   `deriveTotalCount` returns an exact figure when a single page holds everything, or when the
   availability facet is present (it partitions the catalogue exactly once per product), and `null`
   otherwise — the UI then shows the loaded count instead of a guess, and numbered pages fall back to
   prev/next. Search pages always have an exact total.
3. **Deep numbered pagination costs extra requests.** Jumping to an unvisited page walks cursors with
   ids-only queries, capped at 10 hops (`MAX_CURSOR_HOPS`); past that the page is served empty rather
   than wrong. Cursors are memoised per result signature.
4. **`SearchSortKeys` only supports relevance and price.** Title and date sorts are unavailable on
   search pages; `SEARCH_SUPPORTED_SORTS` records this and a test pins it.
5. **Still on SQLite.** D4 requires PostgreSQL for production. The schema is provider-portable, so
   this is a one-line `provider` change plus fresh migrations — but it must happen before launch.
6. **Merchant filter configuration is invisible to Liquid**, so the sidebar swaps from Shopify's
   native markup to the configured version once `scfs.js` boots. Mirroring configuration into an
   app-owned shop metafield would remove the swap (Phase 18).
7. **Engine Native does not AJAX-update the theme's own grid.** Without a `Product results` block,
   native mode navigates, exactly as Shopify's own filtering does. Section Rendering API
   auto-detection of the theme's product-grid section is not implemented.
8. **No E2E coverage yet**, and nothing has been run against a real store or catalogue.

### TODO (near term)

* Install on a development store and work through the §18 E2E scenarios.
* Add Playwright and specs; wire `npm run check` into CI.
* Verify both predictive tiers, the billing upgrade/downgrade/cancel cycle, and over-quota
  degradation on a real store.
* Seed a 10k-product store; measure the §17 budgets; tune queries and indexes.
* Switch Prisma to PostgreSQL and regenerate migrations.
* Replace the `application_url` / `redirect_urls` placeholders and the `support@example.com` address.
* Consider mirroring filter configuration into a shop metafield to remove the first-paint swap.
