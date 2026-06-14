import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pairingService, PairingError } from '../services/pairing.service.js';
import { challengeService } from '../services/challenge.service.js';
import * as paired from '../repositories/paired.repo.js';
import { verifyRegistration, requireSignature } from '../plugins/auth.js';

const ClaimSchema = z.object({ code: z.string().min(1) });

export async function pairingRoutes(app: FastifyInstance): Promise<void> {
  // Step 1 of any authenticated action: get a one-time nonce to sign.
  app.post('/auth/challenge', async (_req, reply) => {
    return reply.code(201).send(challengeService.issue());
  });

  // Register a device by proving ownership of its key. Idempotent.
  app.post('/devices', async (req, reply) => {
    const publicKey = verifyRegistration(req);
    if (!publicKey) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const device = pairingService.register(publicKey);
    return reply.code(201).send({ deviceId: device.id });
  });

  // Mint a short-lived, single-use pairing code (registered device only).
  app.post('/pairing/codes', { preHandler: requireSignature }, async (req, reply) => {
    return reply.code(201).send(pairingService.createPairingCode(req.device!.id));
  });

  // Redeem a pairing code; creates the pairing edge and returns the peer.
  app.post('/pairing/claim', { preHandler: requireSignature }, async (req, reply) => {
    const { code } = ClaimSchema.parse(req.body);
    try {
      return reply.code(201).send(pairingService.claim({ code, deviceId: req.device!.id }));
    } catch (err) {
      if (err instanceof PairingError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // List paired peers (for refreshing the local trust set).
  app.get('/peers', { preHandler: requireSignature }, async (req) => {
    return paired.getPeers(req.device!.id);
  });

  // Remove the pairing edge between the caller and one of its peers. Idempotent.
  app.delete('/peers/:peerId', { preHandler: requireSignature }, async (req, reply) => {
    const { peerId } = req.params as { peerId: string };
    pairingService.unpair(req.device!.id, peerId);
    return reply.code(204).send();
  });
}
