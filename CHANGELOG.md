# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-08-15

Verification of the router against the Solana-based ar.io network, and the fixes
that evaluation surfaced.

### Added
- **Network registry metrics** — `wayfinder_router_network_*` on `/wayfinder/metrics`,
  exposing registry size, fetch counters, cache age and initialization state.
  `wayfinder_router_network_using_fallback` is the alertable signal for a registry
  that could not be fetched. Emitted only when `ROUTING_GATEWAY_SOURCE=network`
- **Degraded health reporting** — `/wayfinder/health` reports `degraded: true` with a
  reason and the underlying error while serving from fallback gateways. Stays `200`,
  and readiness is unaffected, because a degraded router still serves verified content
- `SERVER_IDLE_TIMEOUT_SEC` to tune the server's idle connection timeout
- End-to-end coverage in `scripts/smoke-test.ts` for content verification, route mode,
  manifest subpaths, the sandbox redirect, the Arweave HTTP API and the GraphQL proxy,
  addressed by `Host` header so no wildcard DNS is required
- Tests for `src/handlers/health.ts`, which previously had none

### Changed
- Upgraded `@ar.io/sdk` to 4.1.2 and `@ar.io/wayfinder-core` to 2.0.2
- `Bun.serve` `idleTimeout` now derives from the upstream retry budget
  (`HTTP_REQUEST_TIMEOUT_MS` × `RETRY_ATTEMPTS`, plus headroom, capped at Bun's 255s),
  and warns at startup when that budget still exceeds the cap
- Reworded the `wayfinder_router_gateways_*` metric help text: these count entries in
  the lazily populated gateway health cache, not gateways in the network registry
- CI runs on every pull request rather than only those targeting `main`, gains
  `workflow_dispatch`, and cancels superseded pull request runs

### Fixed
- **Query strings were percent-encoded into the gateway URL path.** The request parser
  passes `pathname + search` as one string, which was assigned to `url.pathname`,
  encoding `?` as `%3F` and turning the query into a literal path segment. Upstream
  gateways received a bogus path and callers lost their query parameters, in both
  proxy and route mode
- **Requests slower than 10s had their connection dropped.** `Bun.serve` defaulted
  `idleTimeout` to 10s while the router's own upstream budget was 90s, so callers saw
  an empty reply instead of content or a `502` and the retry logic could never deliver
- Intermittent test failures (~35% of runs) caused by the `forks` pool evaluating
  `error-handler.ts` twice in one worker, breaking `instanceof` on the custom error
  classes. Test-infra only; the router runs a single module graph under Bun
- `scripts/smoke-test.ts` computed results but never printed them, hiding every failure
  behind a bare pass/fail tally, and its transaction check accepted any status from
  200 to 499

## [0.1.3] - 2026-03-04

### Fixed
- Docker health check IPv6 mismatch and telemetry database permissions

### Changed
- Replaced enterprise docs with focused architecture and operations guides
- Documented `ADMIN_OPEN_BROWSER` and `/api/restart` in README

## [0.1.2] - 2026-02-27

### Added
- Auto-open admin UI on startup, and restart the router from the admin portal
- Windows binary metadata and ar.io icon
- Admin UI dashboard layout

## [0.1.1] - 2026-02-27

### Added
- `/ar-io/healthcheck` alias for API Guard compatibility
- Security headers via Hono `secureHeaders` middleware
- URL scheme validation for all gateway config (rejects non-http/https)
- `decodeURIComponent` guard in stats handler (returns 400 on malformed input)
- 92 new tests: URL utilities, request parser, config validation, rate limiter

### Changed
- Rebranded admin UI to the ar.io theme with editable settings
- LICENSE corrected from AGPL v3 to Apache-2.0 (matches package.json and README)
- Gateway Rewards marked as experimental in README

### Fixed
- Security hardening — SSRF, XSS, injection and auth fixes
- Rate limiter, auth lockout, timing leak and gateway URL consistency
- Windows binary missing `.exe` extension in `build:binaries` script
- Missing admin port (`-p 3001:3001`) in Docker run example

## [0.1.0] - 2026-02-26

Initial release of Wayfinder Router.

### Added
- **Core routing**: Proxy and route modes for fetching/redirecting Arweave content
- **Content verification**: Hash checking against trusted gateways with consensus
- **ArNS resolution**: Arweave Name System support with multi-gateway consensus
- **Manifest verification**: Path manifest verification and content mapping validation
- **Gateway selection**: Four routing strategies — fastest, random, round-robin, temperature
- **Health tracking**: Circuit breaker pattern with configurable thresholds
- **Content cache**: LRU cache with optional disk-backed persistence, atomic writes, crash recovery
- **Root domain hosting**: Serve ArNS names or txIds at root domain with optional restriction mode
- **GraphQL proxy**: Proxy `/graphql` requests to upstream Arweave query endpoints
- **Arweave HTTP API proxy**: Proxy `/info`, `/tx/*`, `/block/*`, `/wallet/*`, `/price/*`, `/peers` with category-aware caching
- **Telemetry**: SQLite-backed metrics with configurable sampling and retention
- **Rate limiting**: Per-IP rate limiting with configurable windows
- **Content moderation**: Admin API for blocking ArNS names and transaction IDs
- **Admin UI**: Built-in web dashboard on separate port with setup wizard, status monitoring, gateway health, telemetry, and settings
- **Gateway ping service**: Background latency probing for temperature-based routing
- **Graceful shutdown**: Request draining with configurable timeouts
- **Gateway rewards** (experimental): Off-chain CLI tool for calculating ARIO token distributions based on gateway performance
- **Standalone binaries**: Cross-compiled for Linux (x64, ARM64), macOS (x64, ARM64), Windows (x64)
- **CI/CD**: GitHub Actions for CI (typecheck, lint, test) and automated releases with checksums
- **Docker**: Production multi-stage Dockerfile with non-root user, health checks; dev Dockerfile with hot reload; docker-compose for both
