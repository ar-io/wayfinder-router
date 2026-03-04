#!/bin/sh
# Ensure data directory and files are writable by the container user.
# Bind-mounted volumes may have files owned by the host user, which
# differ from the container's wayfinder (uid 1001) user.

DATA_DIR="/app/data"

# Create data directories if missing
mkdir -p "$DATA_DIR/content-cache" 2>/dev/null

# Fix ownership on data files if we have permission (running as root via
# docker-compose user override) or if files are world-writable already.
# When running as non-root (default), just ensure files are writable.
if [ "$(id -u)" = "0" ]; then
  chown -R wayfinder:nodejs "$DATA_DIR"
  exec su-exec wayfinder bun src/index.ts "$@"
else
  # Make any existing SQLite files writable by anyone — these are local
  # data files, not secrets, and the container is already sandboxed.
  chmod a+rw "$DATA_DIR"/*.db "$DATA_DIR"/*.db-shm "$DATA_DIR"/*.db-wal 2>/dev/null
  exec bun src/index.ts "$@"
fi
