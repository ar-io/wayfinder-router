# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Security headers via Hono `secureHeaders` middleware
- URL scheme validation for all gateway config (rejects non-http/https)
- `decodeURIComponent` guard in stats handler (returns 400 on malformed input)
- 92 new tests: URL utilities, request parser, config validation, rate limiter

### Changed
- LICENSE corrected from AGPL v3 to Apache-2.0 (matches package.json and README)
- Gateway Rewards marked as experimental in README
- GitHub Releases link updated to ar-io/wayfinder-router

### Fixed
- Windows binary missing `.exe` extension in `build:binaries` script
- `npm run` commands in docs/GATEWAY_REWARDS.md replaced with `bun run`
- Missing admin port (`-p 3001:3001`) in Docker run example
- SHA256 checksum verification instructions added to binary download section

## [0.1.0] - 2025-02-24

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
