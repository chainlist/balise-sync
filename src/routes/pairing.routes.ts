import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pairingService, PairingError } from '../services/pairing.service.js';
import { challengeService } from '../services/challenge.service.js';
import * as paired from '../repositories/paired.repo.js';
import { requireSignature } from '../plugins/auth.js';

const ClaimSchema = z.object({ code: z.string().min(1) });

export async function pairingRoutes(app: FastifyInstance): Promise<void> {
  // Step 1 of any authenticated action: get a one-time nonce to sign.
  app.post('/auth/challenge', async (_req, reply) => {
    return reply.code(201).send(challengeService.issue());
  });

  // Register a device by proving ownership of its key. Idempotent. Not strictly
  // required - any authenticated write registers lazily - but kept as an explicit
  // entry point. Identity is the public key, so there is nothing to hand back.
  app.post('/devices', { preHandler: requireSignature }, async (req, reply) => {
    pairingService.register(req.device!.publicKey);
    return reply.code(204).send();
  });

  // Mint a short-lived, single-use pairing code (authenticated device only).
  app.post('/pairing/codes', { preHandler: requireSignature }, async (req, reply) => {
    return reply.code(201).send(pairingService.createPairingCode(req.device!.publicKey));
  });

  // Redeem a pairing code; creates the pairing edge and returns the peer.
  app.post('/pairing/claim', { preHandler: requireSignature }, async (req, reply) => {
    const { code } = ClaimSchema.parse(req.body);
    try {
      return reply.code(201).send(pairingService.claim({ code, publicKey: req.device!.publicKey }));
    } catch (err) {
      if (err instanceof PairingError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // List paired peers (for refreshing the local trust set).
  app.get('/peers', { preHandler: requireSignature }, async (req) => {
    return paired.getPeers(req.device!.publicKey);
  });

  // Remove the pairing edge between the caller and one of its peers. Idempotent.
  // The peer is identified by its public key.
  app.delete('/peers/:peerKey', { preHandler: requireSignature }, async (req, reply) => {
    const { peerKey } = req.params as { peerKey: string };
    pairingService.unpair(req.device!.publicKey, peerKey);
    return reply.code(204).send();
  });
}
