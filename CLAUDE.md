# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wayfinder Router is a lightweight proxy router for the ar.io network. It acts as an intermediary between clients and Arweave gateways, providing:
- Content verification via hash checking against trusted gateways
- Smart gateway selection with health tracking and circuit breaker patterns
- ArNS (Arweave Name System) resolution with consensus verification
- Manifest verification for path-based content (Arweave manifests)
- Caching for verified content, manifests, and ArNS resolutions
- Two operating modes: `proxy` (fetch, verify, serve) and `route` (redirect to gateway)
- Root domain hosting with optional "restrict to root host only" mode
- GraphQL proxy for upstream Arweave query endpoints

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- ESM module system (`"type": "module"` in package.json)

## Common Commands

```bash
bun run dev          # Start development server with hot reload (bun --watch)
bun run start        # Run production (bun src/index.ts)
bun run typecheck    # Type-check without emitting
bun run test         # Run tests once with vitest
bun run test:watch   # Run tests in watch mode
bunx vitest run src/path/to/file.test.ts  # Run a single test file
bunx vitest run -t "test name"            # Run a single test by name

# Linting and formatting
bun run lint         # Run ESLint on src/
bun run lint:fix     # Auto-fix ESLint issues
bun run format       # Format code with Prettier
bun run format:check # Check formatting without changes

# Build
bun run build            # Compile TypeScript (tsc)
bun run build:binaries   # Cross-compile standalone binaries for all platforms

# CLI utilities
bun run stats        # Show gateway telemetry statistics
bun run clear:telemetry  # Clear telemetry database
bun run clear:all    # Clear all data (telemetry + cache)
bun run rewards      # Reward calculation CLI (also: rewards:calculate, rewards:list)

# Scripts not wired to package.json
bun scripts/smoke-test.ts [base-url]   # End-to-end check against a *running* router
bun scripts/traffic-sim.ts             # Generate synthetic traffic for telemetry testing

# Full e2e sweep against a running router (proxy, route, verification,
# manifest, sandbox redirect, Arweave API, GraphQL). Addresses ArNS and
# sandbox hosts via the Host header, so no wildcard DNS is needed.
bun scripts/smoke-test.ts http://127.0.0.1:3000 --all --tx-id <txId>
```

### Docker

```bash
docker compose up                    # Development
docker build -t wayfinder-router .   # Build production image
docker run -p 3000:3000 -p 3001:3001 --env-file .env wayfinder-router  # Run production
```

## Testing

Vitest with **no config file** — defaults apply, so tests are discovered as `*.test.ts` colocated
next to the code they test (`src/cache/arns-cache.test.ts`, `src/services/verifier.test.ts`, …).
Integration tests that exercise the wired-up server live in `src/integration/`.

`src/test-helpers.ts` holds the shared fixtures and mock factories — **use these instead of
hand-rolling mocks**: `TEST_GATEWAY_A/B/C`, `TEST_GATEWAYS`, `TEST_TX_ID` (a valid 43-char
base64url ID — invalid IDs get rejected by request parsing), `createTestLogger()`,
`createMockGatewaysProvider()`, `createMockRoutingStrategy()`, `createMockVerificationStrategy()`.

Tests must not hit the network: mock `globalThis.fetch` or inject a mock provider/strategy.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`: `typecheck` → `lint` → `test` →
`bun build --compile src/index.ts`. That last step means **the code must stay
single-file-compilable** — no dynamic `import()` of runtime-computed paths, no reliance on
files being present on disk next to the source. This is why the admin UI is an embedded
template literal (`src/admin/ui.ts`) rather than a static asset directory.

## Architecture

### Entry Points
- `src/index.ts` - Application bootstrap, creates logger and starts Hono server
- `src/server.ts` - Hono app configuration, middleware registration, route handlers
- `src/config.ts` - Environment variable loading and validation

### Request Flow
1. **Middleware** (`src/middleware/`) - Registered in `createServer()` in this order, and the order
   matters: `secureHeaders` → `cors` → `requestTracking` (drain-aware, 503s during shutdown) →
   `rateLimiter` → hono logger (optional) → `requestParser` (populates `c.var.requestInfo`) →
   `modeSelector` (populates `c.var.routerMode`). Named routes are registered after middleware;
   content dispatch is the trailing `app.all("*")` catch-all.
2. **Handlers** (`src/handlers/`) - proxy.ts (fetch/verify/serve), route.ts (redirect), health.ts, stats.ts
3. **Services** (`src/services/`) - Core business logic (gateway selection, content fetching, verification, ArNS resolution, manifest resolution)
4. **Cache** (`src/cache/`) - ArNS cache, gateway health, content cache, manifest cache, gateway temperature
5. **Telemetry** (`src/telemetry/`) - Metrics collection and SQLite persistence
6. **Utils** (`src/utils/`) - Header utilities, URL parsing, request deduplication

### Code Patterns

**Factory Functions**: All services use `create*` factory functions that accept dependencies and return typed interfaces:
```typescript
// Example from gateway-selector.ts
export function createGatewaySelector(
  strategy: RoutingStrategy,
  provider: GatewaysProvider,
  config: RouterConfig,
  logger: Logger
): GatewaySelector { ... }
```

**Hono Context Extension**: Custom variables are added to Hono context via type declaration in `src/server.ts`:
```typescript
declare module "hono" {
  interface ContextVariableMap {
    requestInfo: RequestInfo;
    routerMode: RouterMode;
  }
}
```

**Dependency Injection**: `createServer()` in `src/server.ts` wires all services together and returns `{ app, services, startTime }`.

### Key Dependencies
- `@ar.io/wayfinder-core` - SDK for routing strategies, gateway providers, verification
- `@ar.io/sdk` - ar.io network SDK (ARIO class for fetching gateway registry)
- `hono` - Web framework (uses `Bun.serve()` directly, no adapter needed)
- `bun:sqlite` - Telemetry storage (built-in, no npm package)
- `pino` / `pino-pretty` - Logging
- `lru-cache` - Content and manifest caching
- Native `fetch` - HTTP client (`src/http/http-client.ts`, uses `globalThis.fetch` with `AbortSignal.timeout()`)

### TypeScript & Code Style
- Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- All imports must use `.js` extension (ESM requirement, even for `.ts` files)
- Unused variables/args prefixed with `_` are allowed (eslint: `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`)
- Target ES2022, module NodeNext
- Prettier: double quotes, semicolons, 80 char width, trailing commas, 2-space indent
- ESLint: `no-explicit-any` is off, `eqeqeq: smart`, `no-return-await: error`, `strict-boolean-expressions: warn`

### Verification Architecture
The router separates **routing** (where to fetch data) from **verification** (who to trust for hashes):

- **Routing Gateways**: Where to fetch content from. Sources: `network` (all ar.io gateways), `trusted-peers`, `static`
- **Verification Gateways**: Who to trust for hash verification. Sources: `top-staked` (top N by stake), `static`

### Manifest Verification Flow
When a request includes a subpath (e.g., `/txId/path/to/file`):
1. Gateway returns content with `x-arns-resolved-id` and `x-arns-data-id` headers
2. Router fetches manifest from trusted gateways, verifies its hash
3. Router verifies path mapping matches gateway's response
4. Router verifies actual content against expected txId from manifest

### Routing Strategies

Four routing strategies determine how gateways are selected for content fetching:

| Strategy | Behavior |
|----------|----------|
| `fastest` | Concurrent ping, use first responder |
| `random` | Random selection from healthy gateways |
| `round-robin` | Sequential rotation through gateways |
| `temperature` | Weighted selection based on recent latency and success rate |

The `temperature` strategy uses `GatewayTemperatureCache` to track performance metrics. Gateways with better recent performance have higher probability of selection, but slower gateways still receive some traffic (to detect improvements).

### Arweave HTTP API Proxy
The router can proxy Arweave node HTTP API requests (`/info`, `/tx/{id}`, `/block/height/{h}`, etc.) to actual Arweave mining/full nodes. This is separate from ar.io gateway content:

- **Node Selection**: `ArweaveNodeSelector` (`src/services/arweave-node-selector.ts`) - round-robin selection with separate read/write node pools
- **Fetcher**: `ArweaveApiFetcher` (`src/services/arweave-api-fetcher.ts`) - handles caching with category-aware TTLs (immutable vs dynamic data)
- **Handlers**: `src/handlers/arweave-api.ts` - proxy and route handlers
- **Types**: `src/types/arweave-api.ts` - endpoint definitions and path construction

Supported endpoints: `/info`, `/peers`, `/tx/{id}`, `/tx/{id}/status`, `/tx/{id}/{field}`, `/tx/{id}/data`, `/wallet/{addr}/balance`, `/wallet/{addr}/last_tx`, `/price/{bytes}`, `/block/hash/{hash}`, `/block/height/{height}`

### Admin UI Architecture
The admin UI (`src/admin/`) is a built-in web dashboard that runs on a **separate port** (default 3001) from the public router (default 3000). This isolates admin endpoints from public traffic.

- **`src/admin/server.ts`** - Creates a separate Hono app for the admin UI with optional Bearer token auth
- **`src/admin/handler.ts`** - Route handlers: serves SPA HTML and JSON API endpoints (`/api/status`, `/api/gateways`, `/api/telemetry`, `/api/config`, `/api/moderation`, `/api/config/save`)
- **`src/admin/ui.ts`** - Single-file embedded SPA (HTML + CSS + JS as template literals). No React, no build step — ships inside the binary
- **`src/admin/types.ts`** - `AdminDeps` interface

The admin server is started as a separate `Bun.serve()` in `src/index.ts`. Security: binds to `127.0.0.1` by default (localhost only). When `ADMIN_HOST=0.0.0.0`, `ADMIN_TOKEN` is required.

### Rewards System
Off-chain reward calculation for gateway operators in `src/rewards/`:
- **`calculator.ts`** - Calculates gateway rewards from telemetry (request volume, success rate, latency, bytes served)
- **`distributor.ts`** - Handles distribution with delegation splits between operators and delegates
- **`storage.ts`** - Persistence for reward periods
- **`types.ts`** - Reward/delegation types including fraud detection flags (suspicious volume, self-routing, sybil, latency manipulation)

CLI: `bun run rewards`, `bun run rewards:calculate`, `bun run rewards:list`

### Moderation System
`src/moderation/` provides content blocking by ArNS name or txId:
- **`blocklist-service.ts`** - File-watched JSON blocklist with hot reload (no restart needed)
- **`handlers.ts`** - Moderation API endpoints registered on the **public** app under
  `/wayfinder/moderation/*` (only when `config.moderation.enabled`). All are behind
  `createModerationAuthMiddleware` except the public `check/:type/:value` endpoint.
  The admin server exposes its own separate `/api/moderation*` routes over the same service.

### HTTP Client
`src/http/http-client.ts` wraps `globalThis.fetch` with connection pooling. Configured via `HTTP_CONNECTIONS_PER_HOST`, `HTTP_CONNECT_TIMEOUT_MS`, `HTTP_KEEPALIVE_TIMEOUT_MS`.

### Graceful Shutdown
The `ShutdownManager` (`src/utils/shutdown-manager.ts`) handles SIGTERM/SIGINT with a drain period for in-flight requests before force exit. `RequestTracker` (`src/utils/request-tracker.ts`) tracks in-flight requests; 503 responses are sent during drain. Configuration via `SHUTDOWN_DRAIN_TIMEOUT_MS` and `SHUTDOWN_TIMEOUT_MS`.

## API Endpoints

Router management endpoints (public port) are under the `/wayfinder/` prefix:

| Endpoint | Description |
|----------|-------------|
| `/wayfinder/health` | Health check |
| `/ar-io/healthcheck` | Health check (API Guard compatible alias) |
| `/wayfinder/ready` | Readiness check |
| `/wayfinder/metrics` | Prometheus metrics |
| `/wayfinder/info` | Router info and configuration |
| `/wayfinder/stats/gateways` | Gateway performance statistics |
| `/wayfinder/stats/gateways/list` | List all tracked gateways |
| `/wayfinder/stats/gateways/:gateway` | Per-gateway detail |
| `/wayfinder/stats/export` | Telemetry export for reward calculation |
| `/wayfinder/moderation/check/:type/:value` | Blocklist check (public, no auth) |
| `/wayfinder/moderation/*` | Blocklist admin: `blocklist`, `block`, `stats`, `reload` (auth required) |
| `/graphql` | GraphQL proxy (requires `GRAPHQL_PROXY_URL`) |

Admin UI endpoints (admin port, default 3001):

| Endpoint | Description |
|----------|-------------|
| `GET /` | Admin UI SPA |
| `GET /api/status` | Aggregated status data |
| `GET /api/gateways` | Gateway list with health/scores |
| `GET /api/telemetry` | Time-ranged telemetry stats |
| `GET /api/config` | Current config (sanitized) |
| `GET /api/moderation` | Moderation status and blocklist |
| `POST /api/config/save` | Save .env file |
| `POST /api/restart` | Validate config and restart router |

Arweave HTTP API endpoints (when `ARWEAVE_API_ENABLED=true`):

| Endpoint | Description |
|----------|-------------|
| `/info` | Network info (current height, version) |
| `/peers` | Connected peers list |
| `/tx/{id}` | Transaction by ID |
| `/tx/{id}/status` | Transaction confirmation status |
| `/wallet/{addr}/balance` | Wallet balance |
| `/block/height/{h}` | Block by height |

Content is served at:
- `/{txId}` or `/{txId}/path/to/file` - Transaction ID requests
- `http://{arns-name}.localhost:3000/` - ArNS subdomain requests

## Configuration

All configuration via environment variables. See `.env.example` for full list. Key variables:

**Server**: `PORT`, `HOST`, `BASE_DOMAIN`, `ROOT_HOST_CONTENT`, `RESTRICT_TO_ROOT_HOST`, `GRAPHQL_PROXY_URL`, `SERVER_IDLE_TIMEOUT_SEC`
**Admin UI**: `ADMIN_UI_ENABLED`, `ADMIN_PORT`, `ADMIN_HOST`, `ADMIN_TOKEN`, `ADMIN_OPEN_BROWSER`
**Mode**: `DEFAULT_MODE` (`proxy`/`route`), `ALLOW_MODE_OVERRIDE`
**Verification**: `VERIFICATION_ENABLED`, `VERIFICATION_GATEWAY_SOURCE`, `VERIFICATION_GATEWAY_COUNT`
**Routing**: `ROUTING_STRATEGY`, `ROUTING_GATEWAY_SOURCE`, `ROUTING_STATIC_GATEWAYS`
**Cache**: `CONTENT_CACHE_ENABLED`, `CONTENT_CACHE_MAX_SIZE_BYTES`, `ARNS_CACHE_TTL_MS`
**Arweave API**: `ARWEAVE_API_ENABLED`, `ARWEAVE_READ_NODES`, `ARWEAVE_WRITE_NODES`, `ARWEAVE_API_CACHE_IMMUTABLE_TTL_MS`, `ARWEAVE_API_CACHE_DYNAMIC_TTL_MS`
**HTTP**: `HTTP_CONNECTIONS_PER_HOST`, `HTTP_CONNECT_TIMEOUT_MS`, `HTTP_KEEPALIVE_TIMEOUT_MS`
**Network**: `NETWORK_GATEWAY_REFRESH_MS`, `NETWORK_MIN_GATEWAYS`, `NETWORK_FALLBACK_GATEWAYS`
**Logging**: `LOG_LEVEL`, `LOG_PRETTY`
**Resilience**: `EXIT_ON_UNHANDLED_REJECTION`, `EXIT_ON_UNCAUGHT_EXCEPTION`, `EXIT_GRACE_PERIOD_MS`

### Root Host Configuration

- `ROOT_HOST_CONTENT` - Content to serve at root domain (ArNS name or txId, auto-detected). Backwards compatible with `ARNS_ROOT_HOST`.
- `RESTRICT_TO_ROOT_HOST` - When `true`, blocks subdomain and txId path requests (404), only serves root domain content.
- `GRAPHQL_PROXY_URL` - When set, `/graphql` proxies to this upstream GraphQL endpoint.

## Reference Docs

This file is the summary; deeper detail lives in the repo and should be updated alongside it:
- `docs/ARCHITECTURE.md` - Expanded version of the Architecture section above
- `docs/OPERATIONS.md` - Deployment, admin UI setup, monitoring, moderation runbooks
- `README.md` - User-facing quick start and the authoritative env var reference
- `.env.example` - Every config variable with inline documentation

