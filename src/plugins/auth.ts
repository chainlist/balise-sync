import type { FastifyReply, FastifyRequest } from 'fastify';
import { challengeService } from '../services/challenge.service.js';
import { verifySignature } from '../utils/signature.js';
import * as devices from '../repositories/devices.repo.js';
import type { Device } from '../types/domain.js';

declare module 'fastify' {
  interface FastifyRequest {
    device?: Device;
  }
}

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Registration auth: the device isn't stored yet, so it presents its public key
 * directly (X-Public-Key) and proves ownership. Returns the verified public key.
 */
export function verifyRegistration(req: FastifyRequest): string | undefined {
  const publicKey = header(req, 'x-public-key');
  const nonce = header(req, 'x-nonce');
  const signature = header(req, 'x-signature');
  if (!publicKey || !nonce || !signature) return undefined;
  if (!challengeService.consume(nonce)) return undefined;
  if (!verifySignature(publicKey, Buffer.from(nonce, 'hex'), signature)) return undefined;
  return publicKey;
}

/**
 * Authenticated requests: identify by X-Device-Id and verify the signature
 * against the key stored at registration - never a key taken from the request.
 */
export async function requireSignature(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const deviceId = header(req, 'x-device-id');
  const nonce = header(req, 'x-nonce');
  const signature = header(req, 'x-signature');

  if (!deviceId || !nonce || !signature || !challengeService.consume(nonce)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  const device = devices.getDeviceById(deviceId);
  if (!device || !verifySignature(device.publicKey, Buffer.from(nonce, 'hex'), signature)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  req.device = device;
}
