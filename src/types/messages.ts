import { z } from 'zod';

/**
 * An iroh node address. `nodeId` (= the device's public key) is the trust
 * identity; `relayUrl` lets peers connect without public discovery;
 * `directAddresses` are an optional hint for faster hole-punching.
 */
export const NodeAddrSchema = z.object({
  nodeId: z.string().min(1),
  relayUrl: z.string().url().optional(),
  directAddresses: z.array(z.string()).default([]),
});
export type NodeAddr = z.infer<typeof NodeAddrSchema>;

/** Messages a client may send over the /sync WebSocket. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  // First message: identify by deviceId and prove it by signing the challenge nonce.
  z.object({ type: z.literal('auth'), deviceId: z.string().min(1), signature: z.string().min(1) }),
  // "I want to sync" - wake my online peers and tell them how to reach me.
  z.object({ type: z.literal('sync-request'), node: NodeAddrSchema }),
  // "I'm awake and discoverable" - relay my address back to the initiator.
  z.object({ type: z.literal('ready'), to: z.string().min(1), node: NodeAddrSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages the server pushes to a client (constructed server-side). */
export type ServerMessage =
  | { type: 'challenge'; nonce: string }
  | { type: 'hello'; deviceId: string }
  | { type: 'wake'; from: string; node: NodeAddr }
  | { type: 'peer-ready'; from: string; node: NodeAddr }
  | { type: 'sync-targets'; online: string[]; offline: string[] }
  | { type: 'error'; message: string };
