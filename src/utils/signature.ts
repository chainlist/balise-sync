import { createPublicKey, randomBytes, verify } from 'node:crypto';

/** A fresh random challenge, hex-encoded. */
export function randomNonce(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Verify an Ed25519 signature over `message`.
 * @param publicKeyHex raw 32-byte public key, hex-encoded
 * @param signatureHex 64-byte signature, hex-encoded
 * @returns true only if the signature was produced by the matching private key
 */
export function verifySignature(
  publicKeyHex: string,
  message: Buffer,
  signatureHex: string,
): boolean {
  try {
    const raw = Buffer.from(publicKeyHex, 'hex');
    if (raw.length !== 32) return false;

    // Import the raw key via JWK (kty OKP / Ed25519), x = base64url of the 32 bytes.
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
      format: 'jwk',
    });

    // For Ed25519 the algorithm argument must be null (it defines its own hash).
    return verify(null, message, key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
