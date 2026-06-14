import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { ClientMessageSchema, type ServerMessage } from '../types/messages.js';
import { presenceService } from '../services/presence.service.js';
import { signalingService } from '../services/signaling.service.js';
import { randomNonce, verifySignature } from '../utils/signature.js';
import * as devices from '../repositories/devices.repo.js';
import type { Device } from '../types/domain.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

/** Liveness flag we tack onto each socket for the heartbeat sweep. */
type TrackedSocket = WebSocket & { isAlive?: boolean };

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export async function syncWebsocketRoute(app: FastifyInstance): Promise<void> {
  // Detect and reap dead connections (NATs silently drop idle TCP sessions).
  const heartbeat = setInterval(() => {
    for (const client of app.websocketServer.clients) {
      const socket = client as TrackedSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  app.addHook('onClose', async () => clearInterval(heartbeat));

  app.get('/sync', { websocket: true }, (socket: TrackedSocket, _req: FastifyRequest) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // The connection starts unauthenticated. The device must sign this nonce
    // before any signaling is accepted. The nonce is single-use per connection.
    const nonce = randomNonce();
    let device: Device | undefined;
    send(socket, { type: 'challenge', nonce });

    const authTimer = setTimeout(() => {
      if (!device) socket.close(4401, 'authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('message', (raw) => {
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', message: 'invalid message' });
        return;
      }

      const parsed = ClientMessageSchema.safeParse(json);
      if (!parsed.success) {
        send(socket, { type: 'error', message: 'invalid message' });
        return;
      }
      const message = parsed.data;

      // Until authenticated, only an 'auth' message is accepted.
      if (!device) {
        if (message.type !== 'auth') {
          socket.close(4401, 'authentication required');
          return;
        }
        const found = devices.getDeviceById(message.deviceId);
        const valid =
          found !== undefined &&
          verifySignature(found.publicKey, Buffer.from(nonce, 'hex'), message.signature);
        if (!found || !valid) {
          socket.close(4401, 'unauthorized');
          return;
        }
        device = found;
        clearTimeout(authTimer);
        presenceService.register(device.id, socket);
        send(socket, { type: 'hello', deviceId: device.id });
        return;
      }

      switch (message.type) {
        case 'sync-request': {
          const { online, offline } = signalingService.requestSync(device, message.node);
          send(socket, { type: 'sync-targets', online, offline });
          break;
        }
        case 'ready': {
          const delivered = signalingService.relayReady(device, message.to, message.node);
          if (!delivered) send(socket, { type: 'error', message: 'peer not reachable' });
          break;
        }
        case 'auth':
          // Already authenticated; ignore repeat auth attempts.
          break;
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (device) presenceService.unregister(device.id, socket);
    });
  });
}
