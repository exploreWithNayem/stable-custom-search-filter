-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FilterUsageStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "filterHandle" TEXT NOT NULL,
    "filterValue" TEXT NOT NULL,
    "collectionHandle" TEXT NOT NULL DEFAULT '',
    "uses" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_FilterUsageStat" ("day", "filterHandle", "filterValue", "id", "shopId", "uses") SELECT "day", "filterHandle", "filterValue", "id", "shopId", "uses" FROM "FilterUsageStat";
DROP TABLE "FilterUsageStat";
ALTER TABLE "new_FilterUsageStat" RENAME TO "FilterUsageStat";
CREATE INDEX "FilterUsageStat_shopId_day_idx" ON "FilterUsageStat"("shopId", "day");
CREATE INDEX "FilterUsageStat_shopId_day_collectionHandle_idx" ON "FilterUsageStat"("shopId", "day", "collectionHandle");
CREATE UNIQUE INDEX "FilterUsageStat_shopId_day_filterHandle_filterValue_collectionHandle_key" ON "FilterUsageStat"("shopId", "day", "filterHandle", "filterValue", "collectionHandle");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
