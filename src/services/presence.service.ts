import type { WebSocket } from 'ws';
import type { ServerMessage } from '../types/messages.js';
import { safeSend } from '../utils/ws.js';

/**
 * Tracks which devices currently hold a live WebSocket, and pushes messages to them.
 *
 * SHARDING SEAM: this is an in-process Map, so it only works with a single server
 * instance. To run multiple instances, back this with a pub/sub bus (Redis/NATS):
 * `publish()` becomes "deliver to whichever instance holds this device's socket".
 * Everything else in the codebase already routes through `publish()` / `isOnline()`,
 * so that swap stays contained to this file.
 */
class PresenceService {
  #connections = new Map<string, WebSocket>();

  /** Register a socket for a device, replacing any stale connection it had. */
  register(deviceId: string, socket: WebSocket): void {
    const existing = this.#connections.get(deviceId);
    if (existing && existing !== socket) {
      existing.close(4000, 'replaced by a newer connection');
    }
    this.#connections.set(deviceId, socket);
  }

  /** Remove a socket, but only if it's still the one we have registered. */
  unregister(deviceId: string, socket: WebSocket): void {
    if (this.#connections.get(deviceId) === socket) {
      this.#connections.delete(deviceId);
    }
  }

  isOnline(deviceId: string): boolean {
    return this.#connections.has(deviceId);
  }

  /** Send a message to a device. Returns false if it isn't currently reachable. */
  publish(deviceId: string, message: ServerMessage): boolean {
    const socket = this.#connections.get(deviceId);
    if (!socket) return false;
    return safeSend(socket, message);
  }

  get size(): number {
    return this.#connections.size;
  }
}

export const presenceService = new PresenceService();
