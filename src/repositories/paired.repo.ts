import { db } from '../db/connection.js';
import type { Peer } from '../types/domain.js';

const insert = db.prepare(
  'INSERT OR IGNORE INTO paired (device_a, device_b, created_at) VALUES (?, ?, ?)',
);
const peersStmt = db.prepare(`
  SELECT CASE WHEN device_a = @id THEN device_b ELSE device_a END AS publicKey
  FROM paired
  WHERE device_a = @id OR device_b = @id
`);
const remove = db.prepare('DELETE FROM paired WHERE device_a = ? AND device_b = ?');

/** Normalize so a pair is stored once regardless of initiator. */
function order(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function addPair(deviceX: string, deviceY: string): void {
  const [a, b] = order(deviceX, deviceY);
  insert.run(a, b, Date.now());
}

export function getPeers(publicKey: string): Peer[] {
  return peersStmt.all({ id: publicKey }) as Peer[];
}

export function removePair(deviceX: string, deviceY: string): boolean {
  const [a, b] = order(deviceX, deviceY);
  return remove.run(a, b).changes > 0;
}
