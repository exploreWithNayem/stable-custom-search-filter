-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "currencyCode" TEXT,
    "planName" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "onboardedAt" DATETIME,
    "scopes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FilterGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultOpen" BOOLEAN NOT NULL DEFAULT true,
    "collapsible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilterGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Filter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT,
    "displayType" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "multiSelect" BOOLEAN NOT NULL DEFAULT true,
    "showCount" BOOLEAN NOT NULL DEFAULT true,
    "hideEmpty" BOOLEAN NOT NULL DEFAULT true,
    "collapsedByDefault" BOOLEAN NOT NULL DEFAULT false,
    "searchableValues" BOOLEAN NOT NULL DEFAULT false,
    "maxVisibleValues" INTEGER NOT NULL DEFAULT 8,
    "valueSort" TEXT NOT NULL DEFAULT 'count',
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Filter_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Filter_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FilterGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilterValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "swatchColor" TEXT,
    "swatchImage" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "cachedCount" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilterValue_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionFilter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "collectionGid" TEXT NOT NULL,
    "collectionHandle" TEXT NOT NULL,
    "title" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "useDefault" BOOLEAN NOT NULL DEFAULT true,
    "layout" TEXT NOT NULL DEFAULT 'sidebar',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionFilter_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionFilterItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionFilterId" TEXT NOT NULL,
    "filterId" TEXT,
    "groupId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CollectionFilterItem_collectionFilterId_fkey" FOREIGN KEY ("collectionFilterId") REFERENCES "CollectionFilter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionFilterItem_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "placeholder" TEXT NOT NULL DEFAULT 'Search products',
    "minChars" INTEGER NOT NULL DEFAULT 2,
    "debounceMs" INTEGER NOT NULL DEFAULT 250,
    "maxSuggestions" INTEGER NOT NULL DEFAULT 6,
    "showImages" BOOLEAN NOT NULL DEFAULT true,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "showVendors" BOOLEAN NOT NULL DEFAULT false,
    "showProductTypes" BOOLEAN NOT NULL DEFAULT false,
    "showCollections" BOOLEAN NOT NULL DEFAULT true,
    "showViewAll" BOOLEAN NOT NULL DEFAULT true,
    "noResultsText" TEXT NOT NULL DEFAULT 'No products found',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SearchConfiguration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "targetUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchSuggestion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchSynonym" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchSynonym_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "collectionHandle" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'search',
    "clickedProductId" TEXT,
    "sessionHash" TEXT,
    "locale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FilterEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "filterHandle" TEXT NOT NULL,
    "filterValue" TEXT NOT NULL,
    "collectionHandle" TEXT,
    "resultCount" INTEGER NOT NULL,
    "sessionHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchTermStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "zeroResults" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "FilterUsageStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "filterHandle" TEXT NOT NULL,
    "filterValue" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "general" TEXT NOT NULL DEFAULT '{}',
    "appearance" TEXT NOT NULL DEFAULT '{}',
    "analytics" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "shopifyGid" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" DATETIME,
    "currentPeriodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "filterInteractions" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Usage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'merchant',
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE INDEX "Shop_uninstalledAt_idx" ON "Shop"("uninstalledAt");

-- CreateIndex
CREATE INDEX "FilterGroup_shopId_enabled_position_idx" ON "FilterGroup"("shopId", "enabled", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FilterGroup_shopId_handle_key" ON "FilterGroup"("shopId", "handle");

-- CreateIndex
CREATE INDEX "Filter_shopId_enabled_position_idx" ON "Filter"("shopId", "enabled", "position");

-- CreateIndex
CREATE INDEX "Filter_shopId_source_idx" ON "Filter"("shopId", "source");

-- CreateIndex
CREATE INDEX "Filter_groupId_position_idx" ON "Filter"("groupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Filter_shopId_handle_key" ON "Filter"("shopId", "handle");

-- CreateIndex
CREATE INDEX "FilterValue_filterId_position_idx" ON "FilterValue"("filterId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FilterValue_filterId_value_key" ON "FilterValue"("filterId", "value");

-- CreateIndex
CREATE INDEX "CollectionFilter_shopId_collectionHandle_idx" ON "CollectionFilter"("shopId", "collectionHandle");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionFilter_shopId_collectionGid_key" ON "CollectionFilter"("shopId", "collectionGid");

-- CreateIndex
CREATE INDEX "CollectionFilterItem_collectionFilterId_position_idx" ON "CollectionFilterItem"("collectionFilterId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SearchConfiguration_shopId_key" ON "SearchConfiguration"("shopId");

-- CreateIndex
CREATE INDEX "SearchSuggestion_shopId_enabled_position_idx" ON "SearchSuggestion"("shopId", "enabled", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSuggestion_shopId_term_kind_key" ON "SearchSuggestion"("shopId", "term", "kind");

-- CreateIndex
CREATE INDEX "SearchSynonym_shopId_enabled_idx" ON "SearchSynonym"("shopId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSynonym_shopId_term_key" ON "SearchSynonym"("shopId", "term");

-- CreateIndex
CREATE INDEX "SearchEvent_shopId_createdAt_idx" ON "SearchEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_shopId_normalizedTerm_createdAt_idx" ON "SearchEvent"("shopId", "normalizedTerm", "createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_shopId_resultCount_createdAt_idx" ON "SearchEvent"("shopId", "resultCount", "createdAt");

-- CreateIndex
CREATE INDEX "FilterEvent_shopId_createdAt_idx" ON "FilterEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "FilterEvent_shopId_filterHandle_createdAt_idx" ON "FilterEvent"("shopId", "filterHandle", "createdAt");

-- CreateIndex
CREATE INDEX "SearchTermStat_shopId_day_idx" ON "SearchTermStat"("shopId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "SearchTermStat_shopId_day_normalizedTerm_key" ON "SearchTermStat"("shopId", "day", "normalizedTerm");

-- CreateIndex
CREATE INDEX "FilterUsageStat_shopId_day_idx" ON "FilterUsageStat"("shopId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "FilterUsageStat_shopId_day_filterHandle_filterValue_key" ON "FilterUsageStat"("shopId", "day", "filterHandle", "filterValue");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shopId_key" ON "AppSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Usage_shopId_periodKey_key" ON "Usage"("shopId", "periodKey");

-- CreateIndex
CREATE INDEX "ActivityLog_shopId_createdAt_idx" ON "ActivityLog"("shopId", "createdAt");
