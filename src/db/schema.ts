export const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  public_key  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

-- Undirected pairing edges. Always stored with device_a < device_b so a pair
-- has exactly one row regardless of who initiated.
CREATE TABLE IF NOT EXISTS paired (
  device_a    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_b    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (device_a, device_b)
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code        TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
`;
