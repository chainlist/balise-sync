import { presenceService } from './presence.service.js';
import * as paired from '../repositories/paired.repo.js';

/**
 * Orchestrates the wake handshake. The server never carries note data or network
 * addresses - it only tells dormant paired devices to bring up their iroh
 * endpoint, then the initiator dials them directly via iroh discovery.
 */
class SignalingService {
  /**
   * The initiator wants to sync. Wake every online paired device so it brings up
   * iroh. Returns which peers were reached vs. offline, so the initiator can dial
   * the online ones.
   */
  requestSync(initiator: string): { online: string[]; offline: string[] } {
    const peers = paired.getPeers(initiator);
    const online: string[] = [];
    const offline: string[] = [];

    for (const peer of peers) {
      const delivered = presenceService.publish(peer.publicKey, {
        type: 'wake',
        from: initiator,
      });
      (delivered ? online : offline).push(peer.publicKey);
    }

    return { online, offline };
  }
}

export const signalingService = new SignalingService();
