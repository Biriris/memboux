CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");

ALTER TABLE events ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'el' CHECK (default_locale IN ('el', 'en'));

CREATE TABLE IF NOT EXISTS event_members (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members(user_id, created_at DESC);
