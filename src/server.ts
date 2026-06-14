import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { config } from './config.js';
import { presenceService } from './services/presence.service.js';
import { pairingRoutes } from './routes/pairing.routes.js';
import { syncWebsocketRoute } from './routes/sync.ws.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'bad_request', issues: error.issues });
    }
    req.log.error(error);
    return reply.code(error.statusCode ?? 500).send({ error: 'internal_error' });
  });

  // The Tauri client calls these endpoints from its webview, so it needs CORS.
  // Auth is signature-based with no cookies, so reflecting the origin is safe;
  // the custom X-* auth headers are allowed via the reflected preflight.
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'DELETE'] });

  await app.register(websocket);

  app.get('/health', async () => ({ status: 'ok', connections: presenceService.size }));

  await app.register(pairingRoutes);
  await app.register(syncWebsocketRoute);

  return app;
}
