# balise-sync

Pairing + signaling server for Balise's peer-to-peer note sync over [iroh](https://www.iroh.computer/).

It is a **control plane only**. It pairs devices and wakes dormant devices when a peer wants to
sync. **Note content never passes through this server.** It flows directly between devices over
iroh (the data plane).

## Why a server at all

P2P sync needs a rendezvous point. A device can be fully dormant *or* reachable by a peer that
wants to sync, but not both. Something has to relay the "wake up" signal. This server is that
something: each device holds one cheap idle WebSocket, and iroh stays off until a sync actually
starts. The heavy data is P2P, so the server only ever moves tiny control messages.

## Authentication: sign a nonce, no tokens

A device's identity is its Ed25519 keypair (the same key that is its iroh NodeId). There is no
password or bearer token. To authenticate, a device proves it holds the private key by signing a
one-time server challenge:

1. `POST /auth/challenge` returns a random `nonce` (no body needed).
2. The device signs the nonce's raw bytes with its private key.
3. It sends `nonce` + `signature` plus an identifier; the server verifies the signature.

The identifier differs by phase:

- **Registration** (`POST /devices`): the device isn't stored yet, so it sends its **public key**
  (`X-Public-Key`) and the server verifies against that, proving key ownership.
- **Every later call**: the device sends its **deviceId** (`X-Device-Id`), and the server verifies
  against the public key it **stored at registration** - never a key from the request. This also
  sends less over the wire (a 36-char id vs a 64-char key) on every challenge round-trip.

The server only ever stores public keys. Nonces are single-use and short-lived, so a captured
signature cannot be replayed.

## Data model

```sql
devices       (id, public_key)              -- one row per device, public_key is its NodeId
paired        (device_a, device_b)           -- undirected pairing edges (a < b, one row per pair)
pairing_codes (code, device_id, expires_at)  -- short-lived, single-use
```

There is no account/group concept: trust is the set of `paired` edges. When a device syncs, the
server wakes its **direct** paired neighbours. Keep the pairing graph connected (e.g. pair each
new device with an existing one) and pairwise sync converges across the whole set over time.

## Architecture

```
src/
├── config.ts              # env config (zod-validated)
├── index.ts               # entry point: listen + graceful shutdown
├── server.ts              # Fastify assembly: plugins, routes, error handling
├── db/
│   ├── connection.ts      # better-sqlite3 singleton
│   └── schema.ts          # table definitions
├── types/
│   ├── domain.ts          # Device / PairingCode / Peer
│   └── messages.ts        # zod schemas for WebSocket messages
├── utils/
│   └── signature.ts       # Ed25519 verify + nonce generation (node:crypto)
├── repositories/          # thin SQL wrappers (no logic, no state)
│   ├── devices.repo.ts
│   ├── paired.repo.ts
│   └── pairing.repo.ts
├── services/              # business logic (singletons)
│   ├── challenge.service.ts # one-time nonce store for REST auth
│   ├── pairing.service.ts   # register, codes, claim
│   ├── presence.service.ts  # live socket registry (the sharding seam)
│   └── signaling.service.ts # the wake handshake
├── plugins/
│   └── auth.ts            # signature auth (preHandler + helpers)
└── routes/
    ├── pairing.routes.ts  # REST pairing endpoints
    └── sync.ws.ts         # /sync WebSocket signaling
```

## Run

Uses **pnpm** and **Node >= 20**.

```bash
pnpm install
cp .env.example .env
pnpm dev      # watch mode (tsx)
# or
pnpm build && pnpm start
pnpm test     # vitest
```

`better-sqlite3` is a native module. pnpm blocks dependency build scripts by default, so its
prebuilt binary is fetched via the `pnpm.onlyBuiltDependencies` allowlist in `package.json`. If a
fresh install ever skips it, run `pnpm rebuild better-sqlite3` (or `pnpm approve-builds`).

## REST API

Auth headers carry `X-Nonce` + `X-Signature` (hex) plus an identifier: `X-Public-Key` for
registration, `X-Device-Id` for every later call. The nonce comes from `/auth/challenge` and the
signature is over the nonce's raw bytes.

| Method | Path               | Auth      | Purpose                                          |
| ------ | ------------------ | --------- | ------------------------------------------------ |
| POST   | `/auth/challenge`  | none      | Get a one-time nonce to sign                     |
| POST   | `/devices`         | publicKey | Register a device (proves key ownership)         |
| POST   | `/pairing/codes`   | deviceId  | Mint a short-lived, single-use pairing code      |
| POST   | `/pairing/claim`   | deviceId  | Redeem a code; creates the pairing edge          |
| GET    | `/peers`           | deviceId  | List paired peers (refresh the local trust set)  |
| GET    | `/health`          | none      | Liveness + current connection count              |

### Pairing flow

1. Each device registers once: `POST /devices` (with a signed nonce) → `{ deviceId }`.
2. Existing device → `POST /pairing/codes` → `{ code, expiresAt }`. Show the code on screen.
3. New device → `POST /pairing/claim { code }` → `{ peer: { deviceId, publicKey } }`.
4. Either device → `GET /peers` to refresh its local trust set.

## WebSocket `/sync`

On connect the server sends a `challenge`. The device must reply with `auth` (signing the nonce)
before any signaling is accepted; it has 10s to do so.

**Client → server**

```jsonc
// authenticate by signing the challenge nonce
{ "type": "auth", "deviceId": "...", "signature": "..." }

// "I want to sync": wake my online peers and tell them how to reach me
{ "type": "sync-request", "node": { "nodeId": "...", "relayUrl": "...", "directAddresses": [] } }

// "I'm awake and discoverable": relay my address back to the initiator
{ "type": "ready", "to": "<initiator deviceId>", "node": { "nodeId": "...", "relayUrl": "..." } }
```

**Server → client**

```jsonc
{ "type": "challenge", "nonce": "..." }                              // sign this to authenticate
{ "type": "hello", "deviceId": "..." }                               // auth accepted, you're online
{ "type": "wake", "from": "<initiator deviceId>", "node": { ... } }  // wake up and become discoverable
{ "type": "peer-ready", "from": "<peer deviceId>", "node": { ... } } // a peer is up; connect over iroh
{ "type": "sync-targets", "online": ["..."], "offline": ["..."] }    // who got the wake
{ "type": "error", "message": "..." }
```

Liveness is maintained with a 30s ping/pong sweep; dead sockets are reaped.

## Security model

- **Auth** is proof of Ed25519 key ownership (sign a one-time nonce). The server stores only
  public keys, so there is no secret to leak.
- **Pairing integrity** is the real concern: stopping a rogue key from joining. Codes are
  short-lived and single-use. The strongest guarantee lives on the **device** side: each device
  independently checks an incoming iroh connection's NodeId against its own paired set, so a
  tampered server list alone is not enough to sync.
- Signaling is pairing-scoped: a device can only wake / be relayed to its paired peers.
- **No note data** touches this server, so a breach leaks device public keys (NodeIds), not note
  contents.

## Scaling

Thousands of idle WebSocket connections fit comfortably on one modest box (raise the OS file-
descriptor limit). Two pieces are single-instance and would need a shared backplane (Redis/NATS)
to run multiple instances: `PresenceService` (so `publish()` reaches the instance holding a
socket) and `ChallengeService` (so a nonce issued by one instance verifies on another). Both are
contained to their own file.
