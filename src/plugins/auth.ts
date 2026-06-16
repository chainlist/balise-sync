import type { FastifyReply, FastifyRequest } from 'fastify';
import { challengeService } from '../services/challenge.service.js';
import { verifySignature } from '../utils/signature.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated caller, identified solely by its public key. */
    device?: { publicKey: string };
  }
}

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Authenticate a request by its public key. The caller presents X-Public-Key and
 * signs a one-time nonce; the signature is verified against that very key. Auth is
 * therefore stateless - "you are whatever key you can sign for" - so it needs no
 * prior device record and survives a server reset. Persistence (registration,
 * pairing) is the concern of the services, not of authentication.
 */
export async function requireSignature(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const publicKey = header(req, 'x-public-key');
  const nonce = header(req, 'x-nonce');
  const signature = header(req, 'x-signature');

  if (!publicKey || !nonce || !signature || !challengeService.consume(nonce)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  if (!verifySignature(publicKey, Buffer.from(nonce, 'hex'), signature)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  req.device = { publicKey };
}
