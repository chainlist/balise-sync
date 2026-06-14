import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import type { Device } from '../types/domain.js';

const COLS = 'id, public_key AS publicKey, created_at AS createdAt';

const insert = db.prepare(
  'INSERT INTO devices (id, public_key, created_at) VALUES (@id, @publicKey, @createdAt)',
);
const byId = db.prepare(`SELECT ${COLS} FROM devices WHERE id = ?`);
const byPublicKey = db.prepare(`SELECT ${COLS} FROM devices WHERE public_key = ?`);
const del = db.prepare('DELETE FROM devices WHERE id = ?');

export function createDevice(publicKey: string): Device {
  const device: Device = { id: randomUUID(), publicKey, createdAt: Date.now() };
  insert.run(device);
  return device;
}

export function getDeviceById(id: string): Device | undefined {
  return byId.get(id) as Device | undefined;
}

export function getDeviceByPublicKey(publicKey: string): Device | undefined {
  return byPublicKey.get(publicKey) as Device | undefined;
}

export function deleteDevice(id: string): boolean {
  return del.run(id).changes > 0;
}
