import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import * as devices from '../repositories/devices.repo.js';
import * as paired from '../repositories/paired.repo.js';
import * as pairing from '../repositories/pairing.repo.js';
import type { Device, Peer } from '../types/domain.js';

// No ambiguous characters (0/O, 1/I/L) so codes can be read aloud / typed reliably.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export type PairingErrorCode = 'invalid_code' | 'expired_code' | 'used_code' | 'self_pair';

export class PairingError extends Error {
  constructor(
    public readonly code: PairingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PairingError';
  }
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return out;
}

class PairingService {
  /** Register a device by its public key (idempotent). */
  register(publicKey: string): Device {
    return devices.ensureDevice(publicKey);
  }

  /** A device mints a short-lived, single-use code to pair a new device. */
  createPairingCode(publicKey: string): { code: string; expiresAt: number } {
    devices.ensureDevice(publicKey);
    const code = generateCode();
    const expiresAt = Date.now() + config.pairingCodeTtlSeconds * 1000;
    pairing.createCode({ code, publicKey, expiresAt });
    return { code, expiresAt };
  }

  /** Redeem a code: create the pairing edge and return the code owner as a peer. */
  claim(input: { code: string; publicKey: string }): { peer: Peer } {
    const row = pairing.getCode(input.code);
    if (!row) throw new PairingError('invalid_code', 'Unknown pairing code');
    if (row.used) throw new PairingError('used_code', 'Pairing code already used');
    if (row.expiresAt < Date.now()) throw new PairingError('expired_code', 'Pairing code expired');
    if (row.publicKey === input.publicKey) {
      throw new PairingError('self_pair', 'Cannot pair a device with itself');
    }

    devices.ensureDevice(input.publicKey);
    pairing.markUsed(input.code);
    paired.addPair(row.publicKey, input.publicKey);
    return { peer: { publicKey: row.publicKey } };
  }

  /** Remove the pairing edge between a device and one of its peers. Idempotent. */
  unpair(publicKey: string, peerPublicKey: string): boolean {
    return paired.removePair(publicKey, peerPublicKey);
  }
}

export const pairingService = new PairingService();
