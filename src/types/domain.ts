export interface Device {
  id: string;
  /** iroh NodeId = Ed25519 public key, hex-encoded (32 bytes / 64 chars). */
  publicKey: string;
  createdAt: number;
}

export interface PairingCode {
  code: string;
  deviceId: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

/** A paired device as exposed to clients, for the local trust set. */
export interface Peer {
  deviceId: string;
  publicKey: string;
}
