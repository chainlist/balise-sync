import { db } from '../db/connection.js';
import type { PairingCode } from '../types/domain.js';

const insert = db.prepare(
  `INSERT INTO pairing_codes (code, device_id, expires_at, used, created_at)
   VALUES (@code, @deviceId, @expiresAt, 0, @createdAt)`,
);
const byCode = db.prepare(
  'SELECT code, device_id AS deviceId, expires_at AS expiresAt, used, created_at AS createdAt FROM pairing_codes WHERE code = ?',
);
const markUsedStmt = db.prepare('UPDATE pairing_codes SET used = 1 WHERE code = ?');
const deleteExpiredStmt = db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?');

export function createCode(input: { code: string; deviceId: string; expiresAt: number }): void {
  insert.run({ ...input, createdAt: Date.now() });
}

export function getCode(code: string): PairingCode | undefined {
  const row = byCode.get(code) as (Omit<PairingCode, 'used'> & { used: number }) | undefined;
  if (!row) return undefined;
  return { ...row, used: row.used === 1 };
}

export function markUsed(code: string): void {
  markUsedStmt.run(code);
}

export function deleteExpired(before: number = Date.now()): void {
  deleteExpiredStmt.run(before);
}
