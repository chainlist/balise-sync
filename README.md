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
password, bearer token, or server-minted id. To authenticate, a device proves it holds the private
key by signing a one-time server challenge:

1. `POST /auth/challenge` returns a random `nonce` (no body needed).
2. The device signs the nonce's raw bytes with its private key.
3. It sends `X-Public-Key` + `X-Nonce` + `X-Signature`; the server verifies the signature against
   the **presented** public key.

Auth is therefore stateless: "you are whatever key you can sign for." It's the same on every
endpoint (registration and later calls alike), needs no prior device lookup, and self-heals across
a server reset or redeploy. The server only ever stores public keys, so there is no secret to leak,
and nonces are single-use and short-lived, so a captured signature cannot be replayed.

## Data model

```sql
devices       (public_key, created_at)                    -- one row per device; public_key is its NodeId and PK
paired        (device_a, device_b, created_at)             -- undirected pairing edges (a < b, one row per pair), by public key
pairing_codes (code, public_key, expires_at, used, ...)    -- short-lived, single-use
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

Authenticated calls carry `X-Public-Key` + `X-Nonce` + `X-Signature` (all hex). The nonce comes
from `/auth/challenge` and the signature is over the nonce's raw bytes. It's the same on every
authenticated endpoint.

| Method | Path               | Auth   | Purpose                                          |
| ------ | ------------------ | ------ | ------------------------------------------------ |
| POST   | `/auth/challenge`  | none   | Get a one-time nonce to sign                     |
| POST   | `/devices`         | signed | Register a device (proves key ownership)         |
| POST   | `/pairing/codes`   | signed | Mint a short-lived, single-use pairing code      |
| POST   | `/pairing/claim`   | signed | Redeem a code; creates the pairing edge          |
| GET    | `/peers`           | signed | List paired peers (refresh the local trust set)  |
| DELETE | `/peers/:peerKey`  | signed | Remove the pairing edge with a peer (idempotent) |
| GET    | `/health`          | none   | Liveness + current connection count              |

### Pairing flow

1. Each device registers once: `POST /devices` (with a signed nonce) → `{ deviceId }`.
2. Existing device → `POST /pairing/codes` → `{ code, expiresAt }`. Show the code on screen.
3. New device → `POST /pairing/claim { code }` → `{ peer: { deviceId, publicKey } }`.
4. Either device → `GET /peers` to refresh its local trust set.

## WebSocket `/sync`

On connect the server sends a `challenge`. The device must reply with `auth` (signing the nonce)
before any signaling is accepted; it has 10s to do so. The control plane only ever exchanges public
keys, never network addresses: peers dial each other by NodeId and let iroh's relays/discovery
resolve the route.

**Client → server**

```jsonc
// authenticate by signing the challenge nonce
{ "type": "auth", "publicKey": "...", "signature": "..." }

// "I want to sync": wake my online paired peers so they bring up iroh
{ "type": "sync-request" }

// "I'm up": my iroh endpoint is live; tell the initiator to dial me now
{ "type": "ready", "to": "<initiator publicKey>" }
```

**Server → client**

```jsonc
{ "type": "challenge", "nonce": "..." }                            // sign this to authenticate
{ "type": "hello" }                                                // auth accepted, you're online
{ "type": "wake", "from": "<initiator publicKey>" }                // a peer wants to sync: bring up iroh
{ "type": "peer-ready", "from": "<peer publicKey>" }               // that peer is up; dial it over iroh
{ "type": "sync-targets", "online": ["..."], "offline": ["..."] }  // who got the wake
{ "type": "error", "message": "..." }
```

### Wake handshake

There is no fixed wait or address relay; the dial is driven by a `ready` signal, and a stable
tiebreak on NodeId ensures a pair only ever connects once (no double dial):

1. Initiator sends `sync-request`. The server `wake`s each online paired peer and replies with
   `sync-targets` (who was reached).
2. A woken peer brings up its iroh endpoint, then **the lower-NodeId device of the pair dials the
   other directly**; the higher-NodeId device instead sends `ready` and waits to be dialed.
3. When a peer sends `ready`, the server relays it to the initiator as `peer-ready`, and the
   initiator (which is the lower-NodeId side in that case) dials over iroh immediately.

Both ends compute the same NodeId ordering, so exactly one connection is made per pair regardless
of who initiated or whether both sync at once. `ready` relay is pairing-scoped, so a device can
only signal its paired peers.

Liveness is a 30s ping/pong sweep that reaps dead sockets. The same sweep drops any authenticated
socket whose device has no paired peers, since it can neither wake a peer nor be woken.

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
