-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Target" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'web',
    "status" TEXT NOT NULL DEFAULT 'discovering',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeen" DATETIME,
    "greenLightStatus" TEXT NOT NULL DEFAULT 'RED',
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "establishedAt" DATETIME,
    "maintainedFor" INTEGER NOT NULL DEFAULT 0,
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "authEndpoint" TEXT,
    "authUsername" TEXT,
    "sessionCookies" TEXT,
    "currentDnaId" TEXT,
    CONSTRAINT "Target_currentDnaId_fkey" FOREIGN KEY ("currentDnaId") REFERENCES "DnaSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Target" ("createdAt", "currentDnaId", "establishedAt", "greenLightStatus", "id", "lastSeen", "maintainedFor", "status", "trustScore", "type", "updatedAt", "url") SELECT "createdAt", "currentDnaId", "establishedAt", "greenLightStatus", "id", "lastSeen", "maintainedFor", "status", "trustScore", "type", "updatedAt", "url" FROM "Target";
DROP TABLE "Target";
ALTER TABLE "new_Target" RENAME TO "Target";
CREATE INDEX "Target_url_idx" ON "Target"("url");
CREATE INDEX "Target_status_idx" ON "Target"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
