import { db } from '../db/connection.js';
import type { Peer } from '../types/domain.js';

const insert = db.prepare(
  'INSERT OR IGNORE INTO paired (device_a, device_b, created_at) VALUES (?, ?, ?)',
);
const peersStmt = db.prepare(`
  SELECT d.id AS deviceId, d.public_key AS publicKey
  FROM paired p
  JOIN devices d ON d.id = CASE WHEN p.device_a = @id THEN p.device_b ELSE p.device_a END
  WHERE p.device_a = @id OR p.device_b = @id
`);
const pairStmt = db.prepare('SELECT 1 FROM paired WHERE device_a = ? AND device_b = ? LIMIT 1');

/** Normalize so a pair is stored once regardless of initiator. */
function order(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function addPair(deviceX: string, deviceY: string): void {
  const [a, b] = order(deviceX, deviceY);
  insert.run(a, b, Date.now());
}

export function getPeers(deviceId: string): Peer[] {
  return peersStmt.all({ id: deviceId }) as Peer[];
}

export function arePaired(deviceX: string, deviceY: string): boolean {
  const [a, b] = order(deviceX, deviceY);
  return pairStmt.get(a, b) !== undefined;
}
