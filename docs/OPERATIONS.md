# Wayfinder Router Operations Guide

## Running the Router

### Standalone Binary

Download the binary for your platform from [GitHub Releases](https://github.com/ar-io/wayfinder-router/releases):

| Platform | Binary |
|----------|--------|
| Linux x64 | `wayfinder-router-linux-x64` |
| Linux ARM64 | `wayfinder-router-linux-arm64` |
| macOS Intel | `wayfinder-router-darwin-x64` |
| macOS Apple Silicon | `wayfinder-router-darwin-arm64` |
| Windows x64 | `wayfinder-router-windows-x64.exe` |

Each release includes a `checksums.txt` with SHA256 hashes for verification.

```bash
# Make executable (Linux/macOS)
chmod +x wayfinder-router-linux-x64

# Verify checksum (optional but recommended)
sha256sum wayfinder-router-linux-x64
# Compare with checksums.txt from the release

# Run
./wayfinder-router-linux-x64
```

On first launch, the admin UI auto-opens at `http://localhost:3001` with a setup wizard to guide you through configuration. No `.env` file is needed to start — the wizard generates one for you.

#### Building Binaries from Source

```bash
bun install
bun run build:binaries   # outputs to ./builds/
```

This cross-compiles standalone executables for all platforms listed above.

### From Source

```bash
bun install
cp .env.example .env   # configure as needed
bun run dev             # development with hot reload
bun run start           # production
```

### Docker

```bash
# Docker Compose
docker compose up wayfinder-router

# Manual
docker build -t wayfinder-router .
docker run -p 3000:3000 -p 3001:3001 --env-file .env -v ./data:/app/data wayfinder-router
```

The production container runs as a non-root user with resource limits. The `./data` volume persists telemetry, content cache, and blocklist data.

## Configuration

All configuration is via environment variables. See [.env.example](../.env.example) for the full list with descriptions.

### Key Variables by Category

**Server:** `PORT` (3000), `HOST` (0.0.0.0), `BASE_DOMAIN` (localhost), `ROOT_HOST_CONTENT`, `RESTRICT_TO_ROOT_HOST`, `GRAPHQL_PROXY_URL`

**Mode:** `DEFAULT_MODE` (proxy/route), `ALLOW_MODE_OVERRIDE`

**Routing:** `ROUTING_STRATEGY` (fastest/random/round-robin/temperature), `ROUTING_GATEWAY_SOURCE` (network/trusted-peers/static/trusted-ario), `ROUTING_STATIC_GATEWAYS`

**Verification:** `VERIFICATION_ENABLED`, `VERIFICATION_GATEWAY_SOURCE` (top-staked/static), `VERIFICATION_GATEWAY_COUNT`, `ARNS_CONSENSUS_THRESHOLD`

**Cache:** `CONTENT_CACHE_ENABLED`, `CONTENT_CACHE_MAX_SIZE_BYTES`, `CONTENT_CACHE_PATH`, `ARNS_CACHE_TTL_MS`

**Resilience:** `RETRY_ATTEMPTS`, `CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_RESET_MS`, `STREAM_TIMEOUT_MS`

**Telemetry:** `TELEMETRY_ENABLED`, `TELEMETRY_DB_PATH`, `TELEMETRY_RETENTION_DAYS`, `TELEMETRY_SAMPLE_SUCCESS`

**Rate Limiting:** `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`

**Arweave API:** `ARWEAVE_API_ENABLED`, `ARWEAVE_READ_NODES`, `ARWEAVE_WRITE_NODES`

## Admin UI

The admin UI runs on a **separate port** (default 3001) from the public router (default 3000).

```
http://localhost:3001
```

### Pages

- **Status** — Live dashboard: uptime, operating mode, verification status, gateway health bar, cache utilization, ping service stats
- **Gateways** — Sortable table of all ar.io gateways with health, temperature score, latency, success rate, traffic stats
- **Telemetry** — Time-ranged metrics (1h/6h/24h/7d) with request totals, success rates, bytes served, per-gateway performance with CSV export
- **Moderation** — Block/unblock ArNS names and transaction IDs, view blocklist
- **Settings** — View current configuration grouped by category

### Setup Wizard

On first run (when `BASE_DOMAIN=localhost`), the admin UI shows a guided wizard:

1. **Domain** — Configure base domain, port, optional root host content
2. **Routing** — Choose operating mode, routing strategy, gateway source
3. **Verification** — Enable verification, choose trust source, set gateway count and consensus threshold

The wizard generates a `.env` file that can be copied or saved directly.

### Security

| | Public Port (3000) | Admin Port (3001) |
|---|---|---|
| **Default bind** | `0.0.0.0` (all interfaces) | `127.0.0.1` (localhost only) |
| **Admin UI** | Not available (404) | Full access |

- Admin is **never** exposed on the public port
- Default localhost binding means only local access
- Set `ADMIN_HOST=0.0.0.0` to expose over network — **requires** `ADMIN_TOKEN`
- `ADMIN_PORT` must differ from `PORT` (validated at startup)

### Admin Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_UI_ENABLED` | `true` | Enable admin UI server |
| `ADMIN_PORT` | `3001` | Admin server port |
| `ADMIN_HOST` | `127.0.0.1` | Admin bind address |
| `ADMIN_TOKEN` | _(empty)_ | Bearer token for auth (required when not localhost) |
| `ADMIN_OPEN_BROWSER` | `true` | Auto-open browser on startup (skipped in CI/Docker/non-TTY) |

### Remote Access

```bash
# Option 1: SSH tunnel (recommended)
ssh -L 3001:localhost:3001 your-server
# Then open http://localhost:3001

# Option 2: Expose with token auth
ADMIN_HOST=0.0.0.0
ADMIN_TOKEN=your-secure-token-here
```

## Monitoring

### Health and Readiness

```bash
# Health check (is the process running?)
curl http://localhost:3000/wayfinder/health

# Readiness check (is the router ready to serve traffic?)
curl http://localhost:3000/wayfinder/ready
```

### Prometheus Metrics

```bash
curl http://localhost:3000/wayfinder/metrics
```

Exposes standard metrics for scraping by Prometheus. Configure scrape targets to point at `/wayfinder/metrics`.

### Gateway Statistics

```bash
# Summary statistics
curl http://localhost:3000/wayfinder/stats/gateways

# List all tracked gateways
curl http://localhost:3000/wayfinder/stats/gateways/list

# Detailed stats for a specific gateway
curl http://localhost:3000/wayfinder/stats/gateways/:gateway

# Export telemetry data
curl http://localhost:3000/wayfinder/stats/export
```

### Router Info

```bash
curl http://localhost:3000/wayfinder/info
```

Returns current configuration, version, uptime, and operating mode.

### Telemetry

Telemetry is stored in SQLite at `TELEMETRY_DB_PATH` (default `./data/telemetry.db`). Configure sampling rates to control storage growth:

- `TELEMETRY_SAMPLE_SUCCESS=0.1` — Sample 10% of successful requests
- `TELEMETRY_SAMPLE_ERRORS=1.0` — Record all errors
- `TELEMETRY_RETENTION_DAYS=30` — Auto-purge old data

### Log Levels

Logging uses `pino`. Set log level via `LOG_LEVEL` (default: `info`). Available levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

## Content Moderation

### Setup

```bash
MODERATION_ENABLED=true
MODERATION_ADMIN_TOKEN=<your-secure-token>
```

The blocklist is stored at `MODERATION_BLOCKLIST_PATH` (default `./data/blocklist.json`) and is hot-reloaded on changes.

### API Endpoints

All admin endpoints require `Authorization: Bearer <token>` header.

```bash
# Block an ArNS name
curl -X POST http://localhost:3000/wayfinder/moderation/block \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"arns","value":"badcontent","reason":"Policy violation","blockedBy":"admin"}'

# Block a transaction ID
curl -X POST http://localhost:3000/wayfinder/moderation/block \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"txid","value":"abc123...","reason":"DMCA takedown","blockedBy":"legal"}'

# List blocked content
curl http://localhost:3000/wayfinder/moderation/blocklist \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check if content is blocked (no auth required)
curl http://localhost:3000/wayfinder/moderation/check/arns/somename

# Unblock content
curl -X DELETE http://localhost:3000/wayfinder/moderation/block/arns/badcontent \
  -H "Authorization: Bearer YOUR_TOKEN"

# Reload blocklist from disk
curl -X POST http://localhost:3000/wayfinder/moderation/reload \
  -H "Authorization: Bearer YOUR_TOKEN"

# Moderation statistics
curl http://localhost:3000/wayfinder/moderation/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Cache Management

### Content Cache

Verified Arweave content is cached in an LRU. Since Arweave data is immutable, verified content is cached indefinitely — only LRU eviction bounds storage.

```bash
CONTENT_CACHE_ENABLED=true
CONTENT_CACHE_MAX_SIZE_BYTES=53687091200   # 50GB
CONTENT_CACHE_MAX_ITEM_SIZE_BYTES=2147483648  # 2GB
```

### Disk-Backed Cache

For production, enable disk persistence:

```bash
CONTENT_CACHE_PATH=./data/content-cache
```

When set:
- LRU holds metadata only (low memory footprint)
- Content stored as files on disk (`<sha256>.bin` + `<sha256>.meta.json`)
- Cache survives restarts — index restored from disk on startup
- Atomic writes via temp file + rename for crash safety

When empty, the cache operates entirely in-memory.

### Clearing Caches

```bash
# Clear telemetry database
bun run clear:telemetry

# Clear all data (telemetry + cache)
bun run clear:all
```

Or delete the data directory contents directly.

## Troubleshooting

### Port Conflicts

If port 3000 or 3001 is already in use:

```bash
PORT=3080 ADMIN_PORT=3081 ./wayfinder-router-linux-x64
```

`ADMIN_PORT` must differ from `PORT` — the router validates this at startup.

### Gateway Health Issues

Check gateway status via the admin UI Gateways page or:

```bash
curl http://localhost:3000/wayfinder/stats/gateways
```

If all gateways show as unhealthy:
- Verify internet connectivity
- Check `ROUTING_GATEWAY_SOURCE` — if `static`, ensure URLs are correct
- Check circuit breaker settings — `CIRCUIT_BREAKER_THRESHOLD` and `CIRCUIT_BREAKER_RESET_MS`
- Review logs at `debug` level: `LOG_LEVEL=debug`

### ArNS Resolution Failures

ArNS names require consensus across multiple verification gateways. If resolution fails:
- Check `ARNS_CONSENSUS_THRESHOLD` — default is 2 (at least 2 gateways must agree)
- Verify the ArNS name exists on the network
- Check verification gateway health

### Subdomain Routing Not Working

ArNS subdomains require `BASE_DOMAIN` to match your actual domain:

```bash
# For local development
BASE_DOMAIN=localhost

# For production
BASE_DOMAIN=yourdomain.com
```

Requests to `{name}.yourdomain.com` will only be recognized as ArNS subdomains if `BASE_DOMAIN=yourdomain.com`.

### Content Verification Failures

If content consistently fails verification:
- Check `VERIFICATION_GATEWAY_COUNT` — more gateways increases reliability but adds latency
- Verify `VERIFICATION_GATEWAY_SOURCE` is correctly configured
- Check if the content transaction is still being seeded on the network
- Review logs for specific hash mismatch details

## Graceful Shutdown

The router handles SIGTERM and SIGINT signals with a two-phase shutdown:

1. **Drain phase** — Stop accepting new connections, wait for in-flight requests to complete (`SHUTDOWN_DRAIN_TIMEOUT_MS`, default 15s)
2. **Force exit** — If drain exceeds total timeout, force shutdown (`SHUTDOWN_TIMEOUT_MS`, default 30s)

```bash
# Graceful stop
kill -TERM <pid>

# Docker
docker stop wayfinder-router   # sends SIGTERM, waits 10s, then SIGKILL
```

For Docker, consider setting the stop timeout to match your drain period:

```bash
docker stop -t 30 wayfinder-router
```
