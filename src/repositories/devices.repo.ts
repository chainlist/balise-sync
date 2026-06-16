import { db } from '../db/connection.js';
import type { Device } from '../types/domain.js';

const COLS = 'public_key AS publicKey, created_at AS createdAt';

const upsert = db.prepare(
  'INSERT OR IGNORE INTO devices (public_key, created_at) VALUES (?, ?)',
);
const byPublicKey = db.prepare(`SELECT ${COLS} FROM devices WHERE public_key = ?`);

/** Record a device by its public key. Idempotent: a re-registration (or a
 * registration after a server reset) is a no-op rather than an error, which is
 * what makes the control plane tolerant of being wiped or redeployed. */
export function ensureDevice(publicKey: string): Device {
  upsert.run(publicKey, Date.now());
  return byPublicKey.get(publicKey) as Device;
}
