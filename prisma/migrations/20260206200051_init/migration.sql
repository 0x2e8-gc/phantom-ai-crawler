-- CreateTable
CREATE TABLE "Target" (
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
    "currentDnaId" TEXT,
    CONSTRAINT "Target_currentDnaId_fkey" FOREIGN KEY ("currentDnaId") REFERENCES "DnaSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DnaSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "dnaJson" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DnaSnapshot_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DnaSnapshot_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DnaSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "dnaVersionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mcpInsight" TEXT,
    "mcpConfidence" REAL,
    "mcpModel" TEXT NOT NULL DEFAULT 'claude-4-5-sonnet',
    "dnaChanges" TEXT,
    "beforeState" TEXT,
    "afterState" TEXT,
    "trustImpact" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "challengeType" TEXT,
    "challengeSolved" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LearningEvent_dnaVersionId_fkey" FOREIGN KEY ("dnaVersionId") REFERENCES "DnaSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GreenLightState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trustScore" INTEGER NOT NULL,
    "signalsJson" TEXT NOT NULL,
    "establishedAt" DATETIME,
    "maintainedFor" INTEGER NOT NULL DEFAULT 0,
    "lostAt" DATETIME,
    "reasonLost" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GreenLightState_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "dnaVersionId" TEXT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" TEXT NOT NULL,
    "body" TEXT,
    "responseStatus" INTEGER,
    "responseHeaders" TEXT,
    "responseBodyPreview" TEXT,
    "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "challengeDetected" BOOLEAN NOT NULL DEFAULT false,
    "challengeType" TEXT,
    "timingMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RequestLog_dnaVersionId_fkey" FOREIGN KEY ("dnaVersionId") REFERENCES "DnaSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Target_url_idx" ON "Target"("url");

-- CreateIndex
CREATE INDEX "Target_status_idx" ON "Target"("status");

-- CreateIndex
CREATE INDEX "DnaSnapshot_targetId_idx" ON "DnaSnapshot"("targetId");

-- CreateIndex
CREATE INDEX "LearningEvent_targetId_idx" ON "LearningEvent"("targetId");

-- CreateIndex
CREATE INDEX "GreenLightState_targetId_idx" ON "GreenLightState"("targetId");

-- CreateIndex
CREATE INDEX "RequestLog_targetId_idx" ON "RequestLog"("targetId");
