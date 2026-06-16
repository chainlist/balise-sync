import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { ClientMessageSchema, type ServerMessage } from '../types/messages.js';
import { config } from '../config.js';
import { presenceService } from '../services/presence.service.js';
import { signalingService } from '../services/signaling.service.js';
import { wsMetricsService } from '../services/ws-metrics.service.js';
import { randomNonce, verifySignature } from '../utils/signature.js';
import { payloadSize, safeSend } from '../utils/ws.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

/** Liveness flag we tack onto each socket for the heartbeat sweep. */
type TrackedSocket = WebSocket & { isAlive?: boolean };

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
    wsMetricsService.recordConnectionAccepted();
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    socket.on('error', (error: Error) => {
      wsMetricsService.recordConnectionError();
      app.log.warn({ err: error, publicKey }, 'websocket connection error');
    });

    // The connection starts unauthenticated. The device must sign this nonce
    // before any signaling is accepted. The nonce is single-use per connection.
    const nonce = randomNonce();
    let publicKey: string | undefined;
    if (!safeSend(socket, { type: 'challenge', nonce })) return;

    const authTimer = setTimeout(() => {
      if (!publicKey) {
        wsMetricsService.recordAuthTimeout();
        socket.close(4401, 'authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    socket.on('message', (raw: RawData, isBinary: boolean) => {
      const bytes = payloadSize(raw);
      wsMetricsService.recordMessageReceived(bytes);

      if (isBinary) {
        wsMetricsService.recordInvalidMessage();
        socket.close(1003, 'binary frames are not supported');
        return;
      }

      if (bytes > config.wsMaxPayloadBytes) {
        wsMetricsService.recordOversizedMessage();
        socket.close(1009, 'message too large');
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        wsMetricsService.recordInvalidMessage();
        safeSend(socket, { type: 'error', message: 'invalid message' });
        return;
      }

      const parsed = ClientMessageSchema.safeParse(json);
      if (!parsed.success) {
        wsMetricsService.recordInvalidMessage();
        safeSend(socket, { type: 'error', message: 'invalid message' });
        return;
      }
      const message = parsed.data;

      // Until authenticated, only an 'auth' message is accepted.
      if (!publicKey) {
        if (message.type !== 'auth') {
          socket.close(4401, 'authentication required');
          return;
        }
        // Stateless: verify the signature against the presented key directly.
        // No device lookup, so a server reset never strands a valid connection.
        if (!verifySignature(message.publicKey, Buffer.from(nonce, 'hex'), message.signature)) {
          socket.close(4401, 'unauthorized');
          return;
        }
        publicKey = message.publicKey;
        clearTimeout(authTimer);
        presenceService.register(publicKey, socket);
        safeSend(socket, { type: 'hello' });
        return;
      }

      switch (message.type) {
        case 'sync-request': {
          const { online, offline } = signalingService.requestSync(publicKey);
          safeSend(socket, { type: 'sync-targets', online, offline });
          break;
        }
        case 'auth':
          // Already authenticated; ignore repeat auth attempts.
          break;
      }
    });

    socket.on('close', () => {
      wsMetricsService.recordConnectionClosed();
      clearTimeout(authTimer);
      if (publicKey) presenceService.unregister(publicKey, socket);
    });
  });
}
