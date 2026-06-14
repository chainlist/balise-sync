import { presenceService } from './presence.service.js';
import * as paired from '../repositories/paired.repo.js';
import type { Device } from '../types/domain.js';
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
  requestSync(initiator: Device, node: NodeAddr): { online: string[]; offline: string[] } {
    const peers = paired.getPeers(initiator.id);
    const online: string[] = [];
    const offline: string[] = [];

    for (const peer of peers) {
      const delivered = presenceService.publish(peer.deviceId, {
        type: 'wake',
        from: initiator.id,
        node,
      });
      (delivered ? online : offline).push(peer.deviceId);
    }

    return { online, offline };
  }

  /**
   * A woken peer reports it's discoverable. Relay its address back to the
   * initiator. The two must be paired - a device can never signal to a stranger.
   */
  relayReady(readier: Device, targetDeviceId: string, node: NodeAddr): boolean {
    if (!paired.arePaired(readier.id, targetDeviceId)) return false;

    return presenceService.publish(targetDeviceId, {
      type: 'peer-ready',
      from: readier.id,
      node,
    });
  }
}

export const signalingService = new SignalingService();
