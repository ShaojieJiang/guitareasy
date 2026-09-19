-- Accounts, sign-in state, and cloud score storage for GuitarEasy.
-- Timestamps are Unix epoch milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL
);

-- Links a Google/Apple account to a user. Returning sign-ins resolve through
-- this link rather than the provider's current email, so a changed address
-- at the provider still lands on the same GuitarEasy account.
CREATE TABLE oauth_identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

-- Email one-time codes. Only a hash of the code is stored.
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_challenges_email ON auth_challenges(email, created_at);
CREATE INDEX idx_auth_challenges_ip ON auth_challenges(ip, created_at);

-- Browser sessions. `id` is the SHA-256 of the cookie value, so a database
-- read alone cannot be replayed as a session.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The browser-local id of a score uploaded after sign-in. Unique per owner
  -- so retrying an interrupted upload never duplicates a score.
  client_id TEXT,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  tex TEXT NOT NULL,
  size INTEGER NOT NULL,
  published_at INTEGER,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_total INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_scores_owner_client ON scores(owner_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_scores_owner ON scores(owner_id, updated_at DESC);
CREATE INDEX idx_scores_published ON scores(published_at DESC) WHERE published_at IS NOT NULL;

CREATE TABLE ratings (
  score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (score_id, user_id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_score ON comments(score_id, created_at);
