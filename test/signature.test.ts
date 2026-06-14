import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifySignature, randomNonce } from '../src/utils/signature.js';

/** Export an Ed25519 public KeyObject as its raw 32-byte hex form. */
function rawPublicHex(key: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  return key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
}

describe('verifySignature', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicHex = rawPublicHex(publicKey);

  it('accepts a valid signature over the nonce', () => {
    const nonce = randomNonce();
    const signature = sign(null, Buffer.from(nonce, 'hex'), privateKey).toString('hex');
    expect(verifySignature(publicHex, Buffer.from(nonce, 'hex'), signature)).toBe(true);
  });

  it('rejects a signature over a different nonce', () => {
    const signed = sign(null, Buffer.from(randomNonce(), 'hex'), privateKey).toString('hex');
    const otherNonce = randomNonce();
    expect(verifySignature(publicHex, Buffer.from(otherNonce, 'hex'), signed)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = generateKeyPairSync('ed25519');
    const nonce = randomNonce();
    const signature = sign(null, Buffer.from(nonce, 'hex'), other.privateKey).toString('hex');
    expect(verifySignature(publicHex, Buffer.from(nonce, 'hex'), signature)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifySignature('not-hex', Buffer.from('00', 'hex'), 'also-not-hex')).toBe(false);
  });
});
