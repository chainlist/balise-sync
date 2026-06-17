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

  /**
   * A woken peer reports its iroh endpoint is up. Relay that to the initiator so
   * it dials immediately. Pairing-scoped: we only relay between paired devices,
   * so a peer can't use this to ping an arbitrary key.
   */
  relayReady(peer: string, initiator: string): void {
    const paired_with = paired.getPeers(peer).some((p) => p.publicKey === initiator);
    if (!paired_with) return;
    presenceService.publish(initiator, { type: 'peer-ready', from: peer });
  }

  /**
   * Close sockets whose device has no paired peers: such a device can neither
   * wake a peer nor be woken, so the connection is pure overhead. A real client
   * only opens its socket once it has at least one paired peer, so this only ever
   * reaps abusers and devices whose last peer just unpaired them.
   */
  reapUnpaired(): void {
    for (const deviceId of presenceService.deviceIds()) {
      if (paired.getPeers(deviceId).length === 0) {
        presenceService.disconnect(deviceId, 4003, 'no paired peers');
      }
    }
  }
}

export const signalingService = new SignalingService();
