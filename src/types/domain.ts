export interface Device {
  /** iroh NodeId = Ed25519 public key, hex-encoded (32 bytes / 64 chars). This
   * is the device's only identity: stable, self-derived, and what auth verifies. */
  publicKey: string;
  createdAt: number;
}

export interface PairingCode {
  code: string;
  /** Public key of the device that minted the code. */
  publicKey: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

/** A paired device as exposed to clients, for the local trust set. */
export interface Peer {
  publicKey: string;
}
