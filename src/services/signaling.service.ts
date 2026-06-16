import { presenceService } from './presence.service.js';
import * as paired from '../repositories/paired.repo.js';
import type { NodeAddr } from '../types/messages.js';

/**
 * Orchestrates the wake handshake. The server never carries note data - it only
 * tells dormant paired devices to bring up their iroh endpoint and exchanges addresses.
 */
class SignalingService {
  /**
   * The initiator wants to sync. Wake every online paired device, telling them
   * how to reach the initiator. Returns which were reached vs. offline.
   */
  requestSync(initiator: string, node: NodeAddr): { online: string[]; offline: string[] } {
    const peers = paired.getPeers(initiator);
    const online: string[] = [];
    const offline: string[] = [];

    for (const peer of peers) {
      const delivered = presenceService.publish(peer.publicKey, {
        type: 'wake',
        from: initiator,
        node,
      });
      (delivered ? online : offline).push(peer.publicKey);
    }

    return { online, offline };
  }

  /**
   * A woken peer reports it's discoverable. Relay its address back to the
   * initiator. The two must be paired - a device can never signal to a stranger.
   * Both `readier` and `target` are public keys.
   */
  relayReady(readier: string, target: string, node: NodeAddr): boolean {
    if (!paired.arePaired(readier, target)) return false;

    return presenceService.publish(target, {
      type: 'peer-ready',
      from: readier,
      node,
    });
  }
}

export const signalingService = new SignalingService();
