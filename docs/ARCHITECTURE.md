# Wayfinder Router Architecture

## Overview

Wayfinder Router is a lightweight proxy that provides a trusted single-domain entry point to the decentralized [ar.io](https://ar.io) gateway network. It fetches content from Arweave gateways, verifies integrity via cryptographic hash checking, and serves verified data to clients.

```
                          ┌─────────────────────────────┐
                          │     ar.io Gateway Network    │
                          │  ┌─────┐ ┌─────┐ ┌─────┐   │
                          │  │ GW1 │ │ GW2 │ │ GW3 │   │
                          │  └──┬──┘ └──┬──┘ └──┬──┘   │
                          └─────┼───────┼───────┼───────┘
                                │       │       │
Client ──► Wayfinder Router ────┼───────┼───────┘
            │                   │       │
            ├─ Middleware        │       │
            ├─ Handler          │       │
            ├─ Service ─────────┘       │
            ├─ Verification ────────────┘
            ├─ Cache
            └─ Telemetry
```

**Two operating modes:**
- **Proxy** — Fetch, verify, and serve content through the router
- **Route** — Redirect clients directly to a gateway URL

## Core Components

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Application bootstrap, creates logger, starts Hono server and admin server |
| `src/server.ts` | Hono app configuration, middleware registration, route handlers, DI wiring |
| `src/config.ts` | Environment variable loading and validation |

### Request Flow

```
Client Request
  │
  ▼
Middleware (src/middleware/)
  ├─ Request parsing (ArNS subdomain, txId path, root host)
  ├─ Mode selection (proxy vs route)
  ├─ Rate limiting
  └─ Error handling
  │
  ▼
Handler (src/handlers/)
  ├─ proxy.ts — Fetch, verify, and serve content
  ├─ route.ts — Redirect to gateway URL
  ├─ health.ts — Health and readiness checks
  ├─ stats.ts — Gateway statistics
  └─ arweave-api.ts — Arweave node API proxy
  │
  ▼
Services (src/services/)
  ├─ Gateway selection (routing strategy)
  ├─ Content fetching (HTTP client)
  ├─ Hash verification (against trusted gateways)
  ├─ ArNS resolution (consensus across gateways)
  └─ Manifest resolution (path-based content)
  │
  ▼
Cache (src/cache/)
  ├─ Content cache (LRU, optional disk-backed)
  ├─ ArNS cache (TTL-based)
  ├─ Manifest cache
  ├─ Gateway health cache
  └─ Gateway temperature cache
  │
  ▼
Telemetry (src/telemetry/)
  └─ SQLite-backed metrics collection
```

### Utilities

`src/utils/` — Header utilities, URL parsing, request deduplication, shutdown manager.

`src/http/http-client.ts` — HTTP client using native `fetch` with `AbortSignal.timeout()`.

## Verification Architecture

The router separates **routing** (where to fetch data) from **verification** (who to trust for hashes). This is a core design principle — the gateway that serves content is not necessarily the one you trust for correctness.

### Routing Gateways

Where content is fetched from. Configured via `ROUTING_GATEWAY_SOURCE`:

| Source | Behavior |
|--------|----------|
| `network` | All ar.io gateways from the on-chain registry |
| `trusted-peers` | Peer list from a trusted gateway |
| `trusted-ario` | Specific trusted ar.io gateways |
| `static` | Manually configured gateway URLs |

### Verification Gateways

Who to trust for hash verification. Configured via `VERIFICATION_GATEWAY_SOURCE`:

| Source | Behavior |
|--------|----------|
| `top-staked` | Top N gateways by stake (economic security) |
| `static` | Manually configured trusted gateways |

### Verification Flow

1. Router fetches content from a **routing gateway**
2. Router fetches the expected hash from **verification gateways**
3. Router computes the hash of the received content
4. If hashes match, content is served; otherwise, the request fails

This means even if a routing gateway is compromised, tampered content is detected and rejected.

## Manifest Verification

Arweave manifests map paths to transaction IDs (e.g., `/txId/index.html` resolves to a specific content transaction). The router verifies both the manifest and the resolved content.

### Flow

When a request includes a subpath (e.g., `/{txId}/path/to/file`):

1. Gateway returns content with `x-arns-resolved-id` and `x-arns-data-id` headers
2. Router fetches the manifest from trusted gateways and verifies its hash
3. Router verifies the path mapping in the manifest matches the gateway's response
4. Router verifies the actual content hash against the expected txId from the manifest

This prevents a gateway from substituting content within a manifest's path structure.

## Routing Strategies

Four strategies determine how gateways are selected for content fetching. Configured via `ROUTING_STRATEGY`:

| Strategy | Behavior |
|----------|----------|
| `fastest` | Concurrent ping to multiple gateways, use first responder |
| `random` | Random selection from healthy gateways |
| `round-robin` | Sequential rotation through the gateway list |
| `temperature` | Weighted random selection based on recent latency and success rate |

### Temperature Strategy

Uses `GatewayTemperatureCache` to track per-gateway performance metrics. Gateways with better recent performance have higher selection probability, but slower gateways still receive some traffic to detect improvements. This creates a feedback loop where good performance is rewarded with more traffic.

### Health Tracking

All strategies benefit from health tracking and circuit breaker patterns:

- **Health cache** — Tracks gateway availability with configurable TTL
- **Circuit breaker** — After N consecutive failures, a gateway is marked as "open" (unavailable) for a configurable reset period
- **Ping service** — Background latency probing for temperature-based routing

## ArNS Resolution

ArNS (Arweave Name System) names are resolved to transaction IDs via consensus across multiple trusted gateways.

1. Router queries multiple verification gateways for the ArNS name
2. Responses are compared — at least `ARNS_CONSENSUS_THRESHOLD` gateways must agree
3. Resolved txId is cached with a configurable TTL (`ARNS_CACHE_TTL_MS`)

This prevents a single compromised gateway from hijacking name resolution.

## Arweave HTTP API Proxy

The router can proxy Arweave node HTTP API requests (`/info`, `/tx/{id}`, `/block/height/{h}`, etc.) to actual Arweave mining/full nodes. This is separate from ar.io gateway content.

| Component | File | Purpose |
|-----------|------|---------|
| Node selector | `src/services/arweave-node-selector.ts` | Round-robin selection with separate read/write pools |
| Fetcher | `src/services/arweave-api-fetcher.ts` | Caching with category-aware TTLs |
| Handlers | `src/handlers/arweave-api.ts` | Proxy and route handlers |
| Types | `src/types/arweave-api.ts` | Endpoint definitions and path construction |

Cache TTLs are category-aware:
- **Immutable data** (transactions, blocks by hash) — long TTL (24h)
- **Dynamic data** (network info, balances, block height) — short TTL (30s)

## Admin UI

The admin UI (`src/admin/`) runs on a **separate port** (default 3001) from the public router (default 3000), isolating admin endpoints from public traffic.

| File | Purpose |
|------|---------|
| `src/admin/server.ts` | Separate Hono app with optional Bearer token auth |
| `src/admin/handler.ts` | Route handlers for SPA and JSON API endpoints |
| `src/admin/ui.ts` | Single-file embedded SPA (HTML + CSS + JS as template literals) |
| `src/admin/types.ts` | `AdminDeps` interface |

The UI is a self-contained SPA with no React, no build step — it ships inside the binary. The admin server is started as a separate `Bun.serve()` instance in `src/index.ts`.

## Key Design Patterns

### Factory Functions

All services use `create*` factory functions that accept dependencies and return typed interfaces:

```typescript
export function createGatewaySelector(
  strategy: RoutingStrategy,
  provider: GatewaysProvider,
  config: RouterConfig,
  logger: Logger
): GatewaySelector { ... }
```

### Dependency Injection

`createServer()` in `src/server.ts` wires all services together and returns `{ app, services, startTime }`. No DI framework — just explicit constructor injection via factory functions.

### Hono Context Extension

Custom variables are added to Hono context via type declaration:

```typescript
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}
```

### Graceful Shutdown

`ShutdownManager` (`src/utils/shutdown-manager.ts`) handles SIGTERM/SIGINT with a configurable drain period for in-flight requests before force exit.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@ar.io/wayfinder-core` | Routing strategies, gateway providers, verification |
| `@ar.io/sdk` | ar.io network SDK (ARIO class for gateway registry) |
| `hono` | Web framework (uses `Bun.serve()` directly) |
| `bun:sqlite` | Telemetry storage (built-in) |
| `pino` / `pino-pretty` | Logging |
| `lru-cache` | Content and manifest caching |

HTTP client uses native `fetch` via `globalThis.fetch` with `AbortSignal.timeout()`.
