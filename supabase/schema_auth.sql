-- ============================================================
-- schema_auth.sql
-- Password-based authentication tables.
-- Run this file after schema.sql (WebAuthn tables).
-- ============================================================

-- ============================================================
-- auth_users table
-- Stores username + bcrypt-hashed password for credential login.
-- Separate from the WebAuthn credential tables so the two auth
-- flows remain independent and can be evolved independently.
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  -- bcrypt hash of the user's password (never plain text)
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by username on every login attempt
CREATE INDEX IF NOT EXISTS idx_auth_users_username
  ON auth_users (username);

-- ============================================================
-- auth_sessions table
-- Stores active session tokens issued after a successful login.
-- Token is a random UUID. expires_at enforces a TTL.
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  -- 7-day TTL for "remember me"; shorter (1 hour) set application-side
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast token validation on every authenticated request
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token
  ON auth_sessions (token);

-- Fast lookup of all sessions for a user (e.g. logout-all)
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions (user_id);

-- ============================================================
-- Row Level Security (RLS)
-- The Edge Function uses SUPABASE_SERVICE_ROLE_KEY which bypasses
-- RLS. We deny all direct anon/authenticated browser access.
-- ============================================================

ALTER TABLE auth_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- No policies granted to anon or authenticated role.
-- All access goes through the Edge Function (service role key).
