-- ============================================================
-- webauthn_credentials table
-- Stores WebAuthn public key credentials after registration.
-- Each row represents one biometric key pair on one device.
-- A single user can have multiple rows (phone + laptop + tablet).
-- ============================================================

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  -- Primary key
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References the user. In a real system this is a FK to auth.users.
  -- We use TEXT here so it works without Supabase Auth configured.
  user_id       TEXT NOT NULL,

  -- The credential ID returned by the authenticator (Base64URL string).
  -- Uniquely identifies this key pair on this device.
  credential_id TEXT NOT NULL UNIQUE,

  -- COSE-encoded public key stored as Base64 text.
  -- Used to verify signature assertions during authentication.
  public_key    TEXT NOT NULL,

  -- Signature counter: incremented by the authenticator on each use.
  -- If a stored counter >= presented counter → credential may be cloned → reject.
  counter       INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user credential lookup (used in /auth-options)
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
  ON webauthn_credentials (user_id);

-- Index for fast credential lookup during /verify
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id
  ON webauthn_credentials (credential_id);


-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
-- Enable RLS so rows are only accessible through the service role
-- key (used by the Edge Function) or explicit policies.
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- The Edge Function uses the SERVICE_ROLE_KEY which bypasses RLS,
-- so we only need to deny direct anon/authenticated client access.
-- The policies below deny all access from the browser anon key.
-- DO NOT grant SELECT/INSERT/UPDATE on this table to the anon role.

-- (Optional) If you want to allow authenticated users to see their
-- own credentials via the Supabase client, add:
-- CREATE POLICY "Users can view own credentials"
--   ON webauthn_credentials FOR SELECT
--   USING (auth.uid()::text = user_id);

-- ============================================================
-- webauthn_challenges table
-- Stores WebAuthn challenges temporarily for verification.
-- Replaces the ephemeral in-memory Map in the Edge Function.
-- ============================================================

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,  -- 'reg' or 'auth'
  challenge   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + interval '5 minutes',
  UNIQUE (user_id, type)
);

ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
