# Wayfinder Router

A lightweight proxy router for [ar.io](https://ar.io) network gateways with content verification.

## Features

- **Content Verification** — Verifies content integrity via hash checking against trusted gateways
- **Smart Gateway Selection** — Multiple routing strategies (fastest, random, round-robin, temperature) with health tracking and circuit breakers
- **ArNS Support** — Resolves Arweave Name System names with consensus verification across multiple trusted gateways
- **Manifest Verification** — Verifies path manifests and their content mappings against trusted sources
- **Root Domain Hosting** — Serve any ArNS name or txId directly at your root domain
- **Restrict to Root Host Mode** — Lock down router to serve only root domain content
- **GraphQL Proxy** — Proxy GraphQL requests to an upstream Arweave query endpoint
- **Two Operating Modes**:
  - `proxy` — Fetches, verifies, and serves content through the router
  - `route` — Redirects clients to gateway URLs (client fetches directly)
- **Content Cache** — LRU cache for verified content with optional disk-backed persistence for large cache sizes
- **Arweave HTTP API Proxy** — Proxy Arweave node API endpoints (`/info`, `/tx/*`, `/block/*`, `/wallet/*`, etc.)
- **Telemetry** — SQLite-backed metrics for gateway performance tracking with configurable sampling
- **Gateway Rewards** (Experimental) — Off-chain incentive system to reward gateways for serving traffic
- **Admin UI** — Built-in web admin dashboard on a separate port with setup wizard, status monitoring, gateway health, telemetry, moderation, and settings
- **Content Moderation** — Admin API for blocking ArNS names and transaction IDs
- **Rate Limiting** — Per-IP rate limiting with configurable windows and thresholds
- **Graceful Shutdown** — Drain period for in-flight requests before shutdown, with configurable timeouts
- **Gateway Ping Service** — Background latency probing for temperature-based routing
- **Standalone Binaries** — Cross-compile to a single executable for Linux, macOS, and Windows

## Requirements

- [Bun](https://bun.sh) >= 1.0.0

## Quick Start

### Option 1: Standalone Binary (easiest)

Download the latest binary for your platform from [GitHub Releases](https://github.com/ar-io/wayfinder-router/releases):

| Platform | Binary |
|----------|--------|
| Linux x64 | `wayfinder-router-linux-x64` |
| Linux ARM64 | `wayfinder-router-linux-arm64` |
| macOS Intel | `wayfinder-router-darwin-x64` |
| macOS Apple Silicon | `wayfinder-router-darwin-arm64` |
| Windows x64 | `wayfinder-router-windows-x64.exe` |

Each release also includes a `checksums.txt` with SHA256 hashes for verification.

Then run it:

```bash
# Make executable (Linux/macOS)
chmod +x wayfinder-router-linux-x64

# Verify checksum (optional but recommended)
sha256sum wayfinder-router-linux-x64
# Compare with checksums.txt from the release

# Run — the admin UI opens at http://localhost:3001 with a setup wizard
./wayfinder-router-linux-x64
```

The setup wizard at `http://localhost:3001` will guide you through configuration. No `.env` file needed to start.

Or build binaries from source:

```bash
bun install
bun run build:binaries   # outputs to ./builds/
```

### Option 2: Run from Source

```bash
# Install dependencies
bun install

# Copy example environment file and configure
cp .env.example .env

# Start development server with hot reload
bun run dev

# Or run production directly (Bun runs TypeScript natively)
bun run start
```

The server starts at `http://localhost:3000` by default. The admin UI is available at `http://localhost:3001`.

### Option 3: Docker

```bash
# Build and run with docker compose
docker compose up wayfinder-router

# Or build and run manually
docker build -t wayfinder-router .
docker run -p 3000:3000 -p 3001:3001 --env-file .env -v ./data:/app/data wayfinder-router
```

## Admin UI

Wayfinder Router includes a built-in web admin dashboard that runs on a **separate port** from the public router (port 3001 by default). This ensures admin endpoints are never exposed to public traffic.

```
http://localhost:3001
```

### Pages

- **Status** — Live dashboard showing uptime, operating mode, verification status, gateway health bar, cache utilization, and ping service stats
- **Gateways** — Sortable table of all ar.io network gateways with health, temperature score, latency, success rate, and traffic stats
- **Telemetry** — Time-ranged metrics (1h/6h/24h/7d) with request totals, success rates, bytes served, and per-gateway performance table with CSV export
- **Moderation** — Block/unblock ArNS names and transaction IDs, view blocklist, or enable moderation if not yet configured
- **Settings** — View all current configuration grouped by category (server, mode, routing, verification, cache, telemetry, rate limiting, HTTP, shutdown)

### Setup Wizard

On first run (when `BASE_DOMAIN=localhost`), the admin UI shows a guided setup wizard:

1. **Domain** — Configure your base domain, port, and optional root host content
2. **Routing** — Choose operating mode (proxy/route), routing strategy, and gateway source
3. **Verification** — Enable content verification, choose trust source, set gateway count and consensus threshold

The wizard generates a `.env` configuration file that can be copied to clipboard or saved directly.

### Security Model

| | Public Port (3000) | Admin Port (3001) |
|---|---|---|
| **Default bind** | `0.0.0.0` (all interfaces) | `127.0.0.1` (localhost only) |
| **Admin UI** | Not available (404) | Full access |
| **Content serving** | Normal operation | N/A |

- Admin is **never** exposed on the public port
- Default localhost binding means only local access (use SSH tunnel for remote)
- Set `ADMIN_HOST=0.0.0.0` to expose over network — this **requires** `ADMIN_TOKEN` to be set
- `ADMIN_PORT` must differ from `PORT` (validated at startup)

### Admin Configuration

| Variable          | Default     | Description                                                    |
| ----------------- | ----------- | -------------------------------------------------------------- |
| `ADMIN_UI_ENABLED`| `true`      | Enable admin UI server                                         |
| `ADMIN_PORT`      | `3001`      | Admin server port (separate from public)                       |
| `ADMIN_HOST`      | `127.0.0.1` | Admin bind address (`127.0.0.1` = localhost only)              |
| `ADMIN_TOKEN`     | _(empty)_   | Bearer token for auth (required when `ADMIN_HOST` is not localhost) |
| `ADMIN_OPEN_BROWSER` | `true`   | Auto-open admin UI in browser on startup (skipped in CI/Docker/non-TTY) |

### Remote Access

To access the admin UI from a remote machine while keeping it secure:

```bash
# Option 1: SSH tunnel (recommended)
ssh -L 3001:localhost:3001 your-server

# Then open http://localhost:3001 in your browser

# Option 2: Expose with token auth
ADMIN_HOST=0.0.0.0
ADMIN_TOKEN=your-secure-token-here
# The UI will prompt for the token on load
```

## Usage

### Root Domain Hosting

Configure `ROOT_HOST_CONTENT` to serve an ArNS name or transaction ID at your root domain:

```bash
# In .env — serve an ArNS name (auto-detected by format)
ROOT_HOST_CONTENT=wayfinder

# Or serve a transaction ID directly (43-char base64url)
ROOT_HOST_CONTENT=bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U
```

With this configuration:

- `https://yourdomain.com/` → Serves the configured content
- `https://yourdomain.com/docs` → Serves at path `/docs`
- `https://yourdomain.com/wayfinder/info` → Router info page

### Restrict to Root Host Only

Lock down the router to serve only root domain content:

```bash
ROOT_HOST_CONTENT=wayfinder
RESTRICT_TO_ROOT_HOST=true
```

When enabled:

- Subdomain requests are rejected with 404
- TxId path requests (e.g., `/{txId}`) are rejected with 404
- Root domain paths work normally
- Router management endpoints (`/wayfinder/*`) still work

### GraphQL Proxy

Proxy `/graphql` requests to an upstream GraphQL endpoint:

```bash
GRAPHQL_PROXY_URL=https://arweave-search.goldsky.com/graphql
```

### ArNS Subdomain Requests

Access ArNS names via subdomain:

```
http://{arns-name}.localhost:3000/
```

### Transaction ID Requests

Access content by Arweave transaction ID:

```
http://localhost:3000/{txId}
http://localhost:3000/{txId}/path/to/file
```

### Mode Override

Force a specific mode via query parameter (when `ALLOW_MODE_OVERRIDE=true`):

```
http://localhost:3000/{txId}?mode=route
http://localhost:3000/{txId}?mode=proxy
```

### Content Cache

Verified Arweave content is cached in an LRU with optional disk-backed persistence. Since Arweave data is immutable, verified content can be cached indefinitely — only LRU eviction bounds storage.

```bash
# Enable disk-backed cache (recommended for production)
CONTENT_CACHE_ENABLED=true
CONTENT_CACHE_PATH=./data/content-cache
CONTENT_CACHE_MAX_SIZE_BYTES=53687091200   # 50GB
CONTENT_CACHE_MAX_ITEM_SIZE_BYTES=2147483648  # 2GB
```

When `CONTENT_CACHE_PATH` is set:

- LRU holds metadata only (low memory footprint)
- Content bytes stored as files on disk (`<sha256>.bin` + `<sha256>.meta.json`)
- Cache survives restarts — index restored from disk on startup
- Atomic writes via temp file + rename for crash safety

When `CONTENT_CACHE_PATH` is empty, the cache operates entirely in-memory.

### Arweave HTTP API Proxy

Proxy Arweave node HTTP API endpoints through the router:

```bash
ARWEAVE_API_ENABLED=true
```

Supported endpoints:

| Endpoint                  | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `/info`                   | Network info (height, version)                   |
| `/peers`                  | Connected peers list                             |
| `/tx/{id}`                | Transaction by ID                                |
| `/tx/{id}/status`         | Transaction confirmation status                  |
| `/tx/{id}/{field}`        | Transaction field (owner, tags, data_size, etc.) |
| `/tx/{id}/data`           | Transaction data                                 |
| `/tx/{id}/data.{ext}`     | Transaction data with content-type hint          |
| `/tx/{id}/offset`         | Transaction offset                               |
| `/wallet/{addr}/balance`  | Wallet balance                                   |
| `/wallet/{addr}/last_tx`  | Wallet's last transaction                        |
| `/price/{bytes}`          | Price for data upload                            |
| `/price/{bytes}/{target}` | Price for data upload to target                  |
| `/block/hash/{hash}`      | Block by hash                                    |
| `/block/height/{height}`  | Block by height                                  |

Responses are cached with category-aware TTLs: immutable data (transactions, blocks) cached for 24 hours, dynamic data (info, balances) cached for 30 seconds.

### Content Moderation

Block ArNS names or transaction IDs from being served:

```bash
MODERATION_ENABLED=true
MODERATION_ADMIN_TOKEN=<your-secure-token>
```

Admin API (requires Bearer token):

```bash
# Block an ArNS name
curl -X POST http://localhost:3000/wayfinder/moderation/block \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"arns","value":"badcontent","reason":"Policy violation"}'

# Block a transaction ID
curl -X POST http://localhost:3000/wayfinder/moderation/block \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"txid","value":"abc123...","reason":"DMCA takedown"}'

# List blocked content
curl http://localhost:3000/wayfinder/moderation/blocklist \
  -H "Authorization: Bearer <token>"

# Unblock
curl -X DELETE http://localhost:3000/wayfinder/moderation/block/arns/badcontent \
  -H "Authorization: Bearer <token>"
```

## Configuration

All configuration is via environment variables. See [.env.example](.env.example) for the full list with descriptions. Key variables:

### Server

| Variable                | Default     | Description                               |
| ----------------------- | ----------- | ----------------------------------------- |
| `PORT`                  | `3000`      | Server port                               |
| `HOST`                  | `0.0.0.0`   | Bind address                              |
| `BASE_DOMAIN`           | `localhost` | Base domain for ArNS subdomain routing    |
| `ROOT_HOST_CONTENT`     | _(empty)_   | ArNS name or txId to serve at root domain |
| `RESTRICT_TO_ROOT_HOST` | `false`     | Only serve root domain content            |
| `GRAPHQL_PROXY_URL`     | _(empty)_   | Upstream GraphQL endpoint                 |

### Mode

| Variable              | Default | Description                        |
| --------------------- | ------- | ---------------------------------- |
| `DEFAULT_MODE`        | `proxy` | Operating mode: `proxy` or `route` |
| `ALLOW_MODE_OVERRIDE` | `true`  | Allow `?mode=` query parameter     |

### Verification

| Variable                       | Default              | Description                                           |
| ------------------------------ | -------------------- | ----------------------------------------------------- |
| `VERIFICATION_ENABLED`         | `true`               | Enable content hash verification                      |
| `VERIFICATION_GATEWAY_SOURCE`  | `top-staked`         | Source for trusted gateways: `top-staked` or `static` |
| `VERIFICATION_GATEWAY_COUNT`   | `3`                  | Number of top-staked gateways for verification        |
| `VERIFICATION_STATIC_GATEWAYS` | _(see .env.example)_ | Comma-separated gateway URLs                          |
| `ARNS_CONSENSUS_THRESHOLD`     | `2`                  | Minimum gateways that must agree on ArNS resolution   |
| `VERIFICATION_RETRY_ATTEMPTS`  | `3`                  | Gateways to try before failing                        |

### Routing

| Variable                  | Default                     | Description                                                  |
| ------------------------- | --------------------------- | ------------------------------------------------------------ |
| `ROUTING_STRATEGY`        | `fastest`                   | Strategy: `fastest`, `random`, `round-robin`, `temperature`  |
| `ROUTING_GATEWAY_SOURCE`  | `network`                   | Source: `network`, `trusted-peers`, `static`, `trusted-ario` |
| `ROUTING_STATIC_GATEWAYS` | _(see .env.example)_        | Comma-separated gateway URLs                                 |
| `TRUSTED_PEER_GATEWAY`    | `https://turbo-gateway.com` | Gateway for peer list (when source=`trusted-peers`)          |
| `TRUSTED_ARIO_GATEWAYS`   | _(empty)_                   | Trusted gateways (when source=`trusted-ario`)                |

### Cache

| Variable                            | Default              | Description                                        |
| ----------------------------------- | -------------------- | -------------------------------------------------- |
| `CONTENT_CACHE_ENABLED`             | `true`               | Enable verified content cache                      |
| `CONTENT_CACHE_MAX_SIZE_BYTES`      | `53687091200` (50GB) | Maximum cache size                                 |
| `CONTENT_CACHE_MAX_ITEM_SIZE_BYTES` | `2147483648` (2GB)   | Maximum single item size                           |
| `CONTENT_CACHE_PATH`                | _(empty)_            | Disk path for persistence (empty = in-memory only) |
| `ARNS_CACHE_TTL_MS`                 | `300000` (5min)      | ArNS resolution cache TTL                          |

### Resilience

| Variable                    | Default         | Description                           |
| --------------------------- | --------------- | ------------------------------------- |
| `RETRY_ATTEMPTS`            | `3`             | Retry attempts for failed requests    |
| `RETRY_DELAY_MS`            | `100`           | Delay between retries                 |
| `CIRCUIT_BREAKER_THRESHOLD` | `3`             | Failures before opening circuit       |
| `CIRCUIT_BREAKER_RESET_MS`  | `60000` (1min)  | Time before retrying a broken gateway |
| `GATEWAY_HEALTH_TTL_MS`     | `300000` (5min) | Health status cache TTL               |
| `STREAM_TIMEOUT_MS`         | `120000` (2min) | Per-chunk stream read timeout         |

### Telemetry

| Variable                   | Default               | Description                           |
| -------------------------- | --------------------- | ------------------------------------- |
| `TELEMETRY_ENABLED`        | `true`                | Enable telemetry collection           |
| `TELEMETRY_ROUTER_ID`      | `router-{timestamp}`  | Instance identifier                   |
| `TELEMETRY_DB_PATH`        | `./data/telemetry.db` | SQLite database path                  |
| `TELEMETRY_RETENTION_DAYS` | `30`                  | Data retention period                 |
| `TELEMETRY_SAMPLE_SUCCESS` | `0.1`                 | Sampling rate for successful requests |
| `TELEMETRY_SAMPLE_ERRORS`  | `1.0`                 | Sampling rate for errors              |

### Rate Limiting

| Variable                  | Default        | Description                    |
| ------------------------- | -------------- | ------------------------------ |
| `RATE_LIMIT_ENABLED`      | `false`        | Enable per-IP rate limiting    |
| `RATE_LIMIT_WINDOW_MS`    | `60000` (1min) | Rate limit window              |
| `RATE_LIMIT_MAX_REQUESTS` | `1000`         | Max requests per IP per window |

### Moderation

| Variable                    | Default                 | Description                                 |
| --------------------------- | ----------------------- | ------------------------------------------- |
| `MODERATION_ENABLED`        | `false`                 | Enable content moderation                   |
| `MODERATION_BLOCKLIST_PATH` | `./data/blocklist.json` | Blocklist file (auto-created, hot-reloaded) |
| `MODERATION_ADMIN_TOKEN`    | _(empty)_               | Bearer token for admin endpoints            |

### Arweave HTTP API

| Variable                    | Default                      | Description              |
| --------------------------- | ---------------------------- | ------------------------ |
| `ARWEAVE_API_ENABLED`       | `false`                      | Enable Arweave API proxy |
| `ARWEAVE_READ_NODES`        | _(Arweave tip nodes)_        | Nodes for GET requests   |
| `ARWEAVE_WRITE_NODES`       | _(falls back to read nodes)_ | Nodes for POST requests  |
| `ARWEAVE_API_CACHE_ENABLED` | `true`                       | Cache API responses      |

### Shutdown

| Variable                    | Default       | Description                         |
| --------------------------- | ------------- | ----------------------------------- |
| `SHUTDOWN_DRAIN_TIMEOUT_MS` | `15000` (15s) | Grace period for in-flight requests |
| `SHUTDOWN_TIMEOUT_MS`       | `30000` (30s) | Total shutdown timeout              |

## API Endpoints

Router management endpoints are under the `/wayfinder/` prefix:

| Endpoint                                 | Description                           |
| ---------------------------------------- | ------------------------------------- |
| `GET /wayfinder/health`                  | Health check                          |
| `GET /wayfinder/ready`                   | Readiness check                       |
| `GET /wayfinder/metrics`                 | Prometheus metrics                    |
| `GET /wayfinder/info`                    | Router info and configuration         |
| `GET /wayfinder/stats/gateways`          | Gateway performance statistics        |
| `GET /wayfinder/stats/gateways/list`     | List all tracked gateways             |
| `GET /wayfinder/stats/gateways/:gateway` | Detailed stats for a specific gateway |
| `GET /wayfinder/stats/export`            | Export telemetry data                 |

Moderation endpoints (when `MODERATION_ENABLED=true`):

| Endpoint                                          | Auth | Description                 |
| ------------------------------------------------- | ---- | --------------------------- |
| `GET /wayfinder/moderation/check/:type/:value`    | No   | Check if content is blocked |
| `GET /wayfinder/moderation/blocklist`             | Yes  | List all blocked content    |
| `GET /wayfinder/moderation/stats`                 | Yes  | Moderation statistics       |
| `POST /wayfinder/moderation/block`                | Yes  | Block content               |
| `POST /wayfinder/moderation/reload`               | Yes  | Reload blocklist from disk  |
| `DELETE /wayfinder/moderation/block/:type/:value` | Yes  | Unblock content             |

Other endpoints (public port):

| Endpoint                                                        | Description                                  |
| --------------------------------------------------------------- | -------------------------------------------- |
| `ALL /graphql`                                                  | GraphQL proxy (requires `GRAPHQL_PROXY_URL`) |
| `/info`, `/tx/*`, `/block/*`, `/wallet/*`, `/price/*`, `/peers` | Arweave API (requires `ARWEAVE_API_ENABLED`) |

Admin UI endpoints (admin port, default 3001):

| Endpoint               | Description                          |
| ---------------------- | ------------------------------------ |
| `GET /`                | Admin UI SPA                         |
| `GET /api/status`      | Aggregated status data               |
| `GET /api/gateways`    | Gateway list with health and scores  |
| `GET /api/telemetry`   | Time-ranged telemetry stats          |
| `GET /api/config`      | Current configuration (sanitized)    |
| `GET /api/moderation`  | Moderation status and blocklist      |
| `POST /api/config/save`| Save .env file                       |
| `POST /api/restart`    | Validate config and restart router   |

When `ROOT_HOST_CONTENT` is not set, the root endpoint (`/`) displays router info.

## Gateway Rewards (Experimental)

> **Note:** The rewards system is experimental and uses mock services for token transfers and delegation lookups. It is not automatically run by the router — all commands must be invoked manually via the CLI. See [docs/GATEWAY_REWARDS.md](docs/GATEWAY_REWARDS.md) for the full design.

The rewards system is designed to distribute ARIO tokens to gateways based on their performance serving traffic through Wayfinder Router.

### Reward Calculation

Gateways are scored on four weighted factors:

- **Volume (40%)** — Number of requests served
- **Reliability (25%)** — Success rate
- **Speed (20%)** — P95 latency
- **Bandwidth (15%)** — Bytes served

Verification gateways receive a 15% bonus. Rewards are split between operators and delegates according to gateway delegation settings.

### CLI Commands

```bash
# Calculate yesterday's rewards
bun run rewards:calculate

# Calculate for a specific date
bun run rewards calculate -- --date 2026-01-25

# List all reward periods
bun run rewards:list

# Preview distribution (see operator/delegate splits)
bun run rewards preview <periodId>

# Run fraud detection
bun run rewards fraud-check <periodId>

# Approve for distribution (after review)
bun run rewards approve <periodId>

# Reject a period
bun run rewards reject <periodId> -- --reason "reason text"

# Execute distribution (dry-run first!)
bun run rewards distribute <periodId> -- --dry-run
bun run rewards distribute <periodId>
```

### Reward Configuration

| Variable            | Default               | Description                      |
| ------------------- | --------------------- | -------------------------------- |
| `REWARDS_DATA_DIR`  | `./data/rewards`      | Directory for reward period data |
| `TELEMETRY_DB_PATH` | `./data/telemetry.db` | Path to telemetry database       |
| `INSTANCE_ID`       | `wayfinder-main`      | Identifier for this instance     |

See [docs/GATEWAY_REWARDS.md](docs/GATEWAY_REWARDS.md) for full documentation.

## Docker

### Production

```bash
# Build and run with docker compose (maps to host port 3020)
docker compose up wayfinder-router

# Or build and run manually
docker build -t wayfinder-router .
docker run -p 3000:3000 -p 3001:3001 --env-file .env -v ./data:/app/data wayfinder-router
```

The production container runs as a non-root user with resource limits (2 CPUs, 512MB memory). The `./data` volume persists telemetry, content cache, and blocklist data.

### Development

```bash
# Start dev service with hot reload (requires Dockerfile.dev)
docker compose --profile dev up wayfinder-router-dev
```

## Development

```bash
# Core
bun run dev          # Start with hot reload (bun --watch)
bun run start        # Run production (bun src/index.ts)
bun run typecheck    # Type check without emitting
bun run test         # Run tests
bun run test:watch   # Run tests in watch mode

# Build
bun run build            # Compile TypeScript (tsc)
bun run build:binaries   # Cross-compile standalone binaries for all platforms

# Code quality
bun run lint         # Run ESLint
bun run lint:fix     # Auto-fix ESLint issues
bun run format       # Format with Prettier
bun run format:check # Check formatting

# Utilities
bun run stats            # Show gateway telemetry statistics
bun run clear:telemetry  # Clear telemetry database
bun run clear:all        # Clear all data (telemetry + cache)
```

## Documentation

Additional documentation is available in the [docs/](docs/) directory:

- [Product Specification](docs/PRODUCT_SPEC.md) — Full product spec and design goals
- [Enterprise Architecture](docs/ENTERPRISE_ARCHITECTURE.md) — Architecture overview and component design
- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) — Production deployment guide
- [Deployment Diagram](docs/DEPLOYMENT_DIAGRAM.md) — Infrastructure topology
- [Gateway Rewards](docs/GATEWAY_REWARDS.md) — Rewards system documentation
- [Economic Model](docs/ECONOMIC_MODEL.md) — Token economics and incentive design

## License

Apache-2.0
