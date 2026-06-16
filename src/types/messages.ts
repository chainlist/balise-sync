import { z } from 'zod';

/**
 * Messages a client may send over the /sync WebSocket. The control plane only
 * exchanges device identities (public keys), never network addresses: peers
 * dial each other by node id and let iroh's relays/discovery resolve the route.
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  // First message: present the public key and prove it by signing the challenge nonce.
  z.object({ type: z.literal('auth'), publicKey: z.string().min(1), signature: z.string().min(1) }),
  // "I want to sync" - wake my online paired peers so they bring up iroh.
  z.object({ type: z.literal('sync-request') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages the server pushes to a client (constructed server-side). `from` is
 * always a peer's public key. */
export type ServerMessage =
  | { type: 'challenge'; nonce: string }
  | { type: 'hello' }
  | { type: 'wake'; from: string }
  | { type: 'sync-targets'; online: string[]; offline: string[] }
  | { type: 'error'; message: string };
