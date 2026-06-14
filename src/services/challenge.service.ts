import { config } from '../config.js';
import { randomNonce } from '../utils/signature.js';

/**
 * Issues and tracks one-time challenge nonces. A nonce only has to be
 * server-issued and single-use - the signature itself binds it to a key, so the
 * nonce is identity-agnostic and the same one works for registration or login.
 *
 * In-memory and single-instance (same constraint as PresenceService). To run
 * multiple instances, back this with a shared store (Redis) keyed by nonce.
 */
class ChallengeService {
  #pending = new Map<string, number>(); // nonce -> expiresAt

  issue(): { nonce: string; expiresAt: number } {
    this.#prune();
    const nonce = randomNonce();
    const expiresAt = Date.now() + config.challengeTtlSeconds * 1000;
    this.#pending.set(nonce, expiresAt);
    return { nonce, expiresAt };
  }

  /** Consume a nonce. Returns true only if it was issued and is unexpired. */
  consume(nonce: string): boolean {
    const expiresAt = this.#pending.get(nonce);
    if (expiresAt === undefined) return false;
    this.#pending.delete(nonce); // single use, even on failure
    return expiresAt >= Date.now();
  }

  #prune(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.#pending) {
      if (expiresAt < now) this.#pending.delete(nonce);
    }
  }
}

export const challengeService = new ChallengeService();
