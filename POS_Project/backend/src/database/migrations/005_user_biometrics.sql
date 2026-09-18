-- Migration: 005_user_biometrics.sql
-- Description: Store WebAuthn Platform Authenticator credentials (Face ID, Fingerprint, Windows Hello)

CREATE TABLE IF NOT EXISTS user_biometrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mac_address TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  algorithm TEXT DEFAULT 'ES256',
  counter INTEGER DEFAULT 0,
  device_name TEXT,
  created_at TEXT DEFAULT (datetime('now', '+7 hours')),
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_biometrics_user ON user_biometrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_biometrics_cred ON user_biometrics(credential_id);
CREATE INDEX IF NOT EXISTS idx_user_biometrics_mac ON user_biometrics(mac_address);
