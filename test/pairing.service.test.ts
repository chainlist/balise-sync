import { describe, it, expect, beforeAll } from 'vitest';

// Use an in-memory database. Set before importing modules that open the connection.
type PairingService = typeof import('../src/services/pairing.service.js')['pairingService'];

let pairingService: PairingService;

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';
  ({ pairingService } = await import('../src/services/pairing.service.js'));
});

describe('pairingService', () => {
  it('registers a device and is idempotent on the public key', () => {
    const a = pairingService.register('aa'.repeat(32));
    const again = pairingService.register('aa'.repeat(32));
    expect(a.publicKey).toBe(again.publicKey);
  });

  it('pairs two devices via a code and exposes them as peers', () => {
    const a = pairingService.register('11'.repeat(32));
    const b = pairingService.register('22'.repeat(32));

    const { code } = pairingService.createPairingCode(a.publicKey);
    const { peer } = pairingService.claim({ code, publicKey: b.publicKey });

    expect(peer.publicKey).toBe(a.publicKey);
  });

  it('rejects an unknown code', () => {
    const b = pairingService.register('33'.repeat(32));
    expect(() => pairingService.claim({ code: 'NOPE', publicKey: b.publicKey })).toThrow();
  });

  it('rejects reusing a code', () => {
    const a = pairingService.register('44'.repeat(32));
    const b = pairingService.register('55'.repeat(32));
    const { code } = pairingService.createPairingCode(a.publicKey);

    pairingService.claim({ code, publicKey: b.publicKey });
    expect(() => pairingService.claim({ code, publicKey: b.publicKey })).toThrow();
  });

  it('rejects pairing a device with itself', () => {
    const a = pairingService.register('66'.repeat(32));
    const { code } = pairingService.createPairingCode(a.publicKey);
    expect(() => pairingService.claim({ code, publicKey: a.publicKey })).toThrow();
  });

  it('unpairs two paired devices regardless of order', () => {
    const a = pairingService.register('77'.repeat(32));
    const b = pairingService.register('88'.repeat(32));
    const { code } = pairingService.createPairingCode(a.publicKey);
    pairingService.claim({ code, publicKey: b.publicKey });

    // Either side can remove the edge; both then see no peers.
    expect(pairingService.unpair(b.publicKey, a.publicKey)).toBe(true);
    expect(pairingService.unpair(b.publicKey, a.publicKey)).toBe(false);
  });
});
