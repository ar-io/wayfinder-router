/**
 * Admin UI Handler
 * Serves the embedded SPA and provides JSON API endpoints
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { AdminDeps } from "./types.js";
import { renderAdminPage } from "./ui.js";
import { validateEnvFile } from "../config.js";

function getTimeRange(range: string): { startHour: string; endHour: string } {
  const now = new Date();

  // End = start of the NEXT hour so the current hour is included
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);

  const start = new Date(end);
  switch (range) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "6h":
      start.setHours(start.getHours() - 6);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    default: // 24h
      start.setDate(start.getDate() - 1);
      break;
  }

  return {
    startHour: start.toISOString().slice(0, 13) + ":00:00.000Z",
    endHour: end.toISOString().slice(0, 13) + ":00:00.000Z",
  };
}

export function createAdminRoutes(deps: AdminDeps): Hono {
  const admin = new Hono();
  const html = renderAdminPage(deps.version);

  // Serve the SPA HTML
  admin.get("/", (c: Context) => {
    return c.html(html);
  });

  // Status API - aggregated dashboard data
  admin.get("/api/status", (c: Context) => {
    const uptimeMs = Date.now() - deps.startTime;
    const gatewayHealth = deps.gatewaySelector.healthStats();
    const cacheStats = deps.contentCache.stats();
    const pingStats = deps.pingService?.getStats() ?? null;
    const needsSetup = deps.config.server.baseDomain === "localhost";

    return c.json({
      uptimeMs,
      version: deps.version,
      mode: deps.config.mode.default,
      verificationEnabled: deps.config.verification.enabled,
      verificationSource: deps.config.verification.gatewaySource,
      verificationCount: deps.config.verification.gatewayCount,
      routingStrategy: deps.config.routing.strategy,
      gateways: gatewayHealth,
      cache: cacheStats,
      ping: pingStats,
      needsSetup,
    });
  });

  // Gateways API - list with scores and telemetry
  admin.get("/api/gateways", (c: Context) => {
    const tempCache = deps.wayfinderServices.temperatureCache;

    // Get temperature scores if available
    const scores: Map<
      string,
      {
        score: number;
        avgLatencyMs: number | null;
        successRate: number | null;
      }
    > = new Map();
    if (tempCache) {
      const tempStats = tempCache.getAllScores();
      for (const s of tempStats) {
        scores.set(s.gateway, {
          score: s.score,
          avgLatencyMs: s.avgLatencyMs,
          successRate: s.successRate,
        });
      }
    }

    // Get telemetry stats if available
    const telemetryStats: Map<
      string,
      { totalRequests: number; bytesServed: number; successRate: number }
    > = new Map();
    if (deps.telemetryService) {
      const range = getTimeRange("24h");
      const stats = deps.telemetryService.getGatewayStats(
        range.startHour,
        range.endHour,
      );
      for (const s of stats) {
        telemetryStats.set(s.gateway, {
          totalRequests: s.totalRequests,
          bytesServed: s.bytesServed,
          successRate: s.successRate,
        });
      }
    }

    // Merge data sources into a unified gateway list
    const allGateways = new Set<string>();
    for (const k of scores.keys()) allGateways.add(k);
    for (const k of telemetryStats.keys()) allGateways.add(k);

    // Also add known gateways from telemetry
    if (deps.telemetryService) {
      for (const gw of deps.telemetryService.getKnownGateways()) {
        allGateways.add(gw);
      }
    }

    const gateways = Array.from(allGateways).map((gw) => {
      const scoreInfo = scores.get(gw);
      const telemetry = telemetryStats.get(gw);

      return {
        gateway: gw,
        health: scoreInfo
          ? scoreInfo.successRate !== null && scoreInfo.successRate > 0.5
            ? "healthy"
            : "unhealthy"
          : "unknown",
        score: scoreInfo?.score ?? null,
        latencyMs: scoreInfo?.avgLatencyMs ?? null,
        successRate: telemetry?.successRate ?? scoreInfo?.successRate ?? null,
        requests: telemetry?.totalRequests ?? 0,
        bytesServed: telemetry?.bytesServed ?? 0,
      };
    });

    return c.json({ gateways, total: gateways.length });
  });

  // Telemetry API
  admin.get("/api/telemetry", (c: Context) => {
    if (!deps.telemetryService) {
      return c.json({ enabled: false });
    }

    // Flush any buffered events so the query sees the latest data
    deps.telemetryService.flush();

    const range = getTimeRange((c.req.query("range") as string) || "24h");
    const stats = deps.telemetryService.getGatewayStats(
      range.startHour,
      range.endHour,
    );

    let totalRequests = 0;
    let successfulRequests = 0;
    let totalBytesServed = 0;
    const activeGateways = stats.length;

    for (const s of stats) {
      totalRequests += s.totalRequests;
      successfulRequests += s.successfulRequests;
      totalBytesServed += s.bytesServed;
    }

    return c.json({
      enabled: true,
      gateways: stats,
      totals: {
        totalRequests,
        successfulRequests,
        totalBytesServed,
        activeGateways,
      },
    });
  });

  // Telemetry export - CSV download
  admin.get("/api/telemetry/export", (c: Context) => {
    if (!deps.telemetryService) {
      return c.json({ error: "Telemetry not enabled" }, 400);
    }

    const format = c.req.query("format") || "csv";
    const range = getTimeRange((c.req.query("range") as string) || "24h");
    const data = deps.telemetryService.exportRewardData(
      range.startHour,
      range.endHour,
    );

    if (format === "json") {
      return c.json(data);
    }

    // CSV format
    const headers = [
      "gateway",
      "total_requests",
      "successful_requests",
      "bytes_served",
      "success_rate",
      "verification_success_rate",
      "avg_latency_ms",
      "availability_rate",
    ];
    const csvEscape = (val: string | number): string => {
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const rows = data.gateways.map((gw) =>
      [
        csvEscape(gw.gateway),
        gw.totalRequests,
        gw.successfulRequests,
        gw.bytesServed,
        gw.successRate.toFixed(4),
        gw.verificationSuccessRate.toFixed(4),
        gw.avgLatencyMs.toFixed(1),
        gw.availabilityRate.toFixed(4),
      ].join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `telemetry-${range.startHour.slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  // Config API - sanitized config (no tokens)
  admin.get("/api/config", (c: Context) => {
    const cfg = deps.config;
    return c.json({
      server: {
        port: cfg.server.port,
        host: cfg.server.host,
        baseDomain: cfg.server.baseDomain,
        rootHostContent: cfg.server.rootHostContent,
        restrictToRootHost: cfg.server.restrictToRootHost,
        graphqlProxyUrl: cfg.server.graphqlProxyUrl || "",
      },
      mode: cfg.mode,
      routing: {
        strategy: cfg.routing.strategy,
        gatewaySource: cfg.routing.gatewaySource,
        trustedPeerGateway: cfg.routing.trustedPeerGateway.origin,
        staticGateways: cfg.routing.staticGateways.map((u) => u.origin),
        trustedArioGateways: cfg.routing.trustedArioGateways.map(
          (u) => u.origin,
        ),
        retryAttempts: cfg.routing.retryAttempts,
        retryDelayMs: cfg.routing.retryDelayMs,
        temperatureWindowMs: cfg.routing.temperatureWindowMs,
        temperatureMaxSamples: cfg.routing.temperatureMaxSamples,
      },
      verification: {
        enabled: cfg.verification.enabled,
        gatewaySource: cfg.verification.gatewaySource,
        gatewayCount: cfg.verification.gatewayCount,
        staticGateways: cfg.verification.staticGateways.map((u) => u.origin),
        consensusThreshold: cfg.verification.consensusThreshold,
        retryAttempts: cfg.verification.retryAttempts,
      },
      networkGateways: {
        refreshIntervalMs: cfg.networkGateways.refreshIntervalMs,
        minGateways: cfg.networkGateways.minGateways,
        fallbackGateways: cfg.networkGateways.fallbackGateways.map(
          (u) => u.origin,
        ),
      },
      cache: {
        contentEnabled: cfg.cache.contentEnabled,
        contentMaxSizeBytes: cfg.cache.contentMaxSizeBytes,
        contentMaxItemSizeBytes: cfg.cache.contentMaxItemSizeBytes,
        contentPath: cfg.cache.contentPath || "",
        arnsTtlMs: cfg.cache.arnsTtlMs,
      },
      telemetry: {
        enabled: cfg.telemetry.enabled,
        routerId: cfg.telemetry.routerId,
        retentionDays: cfg.telemetry.storage.retentionDays,
        sampling: cfg.telemetry.sampling,
      },
      rateLimit: cfg.rateLimit,
      ping: cfg.ping,
      resilience: cfg.resilience,
      errorHandling: cfg.errorHandling,
      shutdown: cfg.shutdown,
      http: {
        connectionsPerHost: cfg.http.connectionsPerHost,
        connectTimeoutMs: cfg.http.connectTimeoutMs,
        requestTimeoutMs: cfg.http.requestTimeoutMs,
        keepAliveTimeoutMs: cfg.http.keepAliveTimeoutMs,
      },
      logging: cfg.logging,
      arweaveApi: {
        enabled: cfg.arweaveApi.enabled,
        readNodes: cfg.arweaveApi.readNodes.map((u) => u.origin),
        writeNodes: cfg.arweaveApi.writeNodes.map((u) => u.origin),
        retryAttempts: cfg.arweaveApi.retryAttempts,
        timeoutMs: cfg.arweaveApi.timeoutMs,
      },
      moderation: {
        enabled: cfg.moderation.enabled,
        blocklistPath: cfg.moderation.blocklistPath,
      },
      admin: {
        enabled: cfg.admin.enabled,
        port: cfg.admin.port,
        host: cfg.admin.host,
      },
    });
  });

  // Moderation API (proxied for admin UI)
  admin.get("/api/moderation", (c: Context) => {
    if (!deps.config.moderation.enabled || !deps.blocklistService) {
      return c.json({ enabled: false });
    }

    const stats = deps.blocklistService.getStats();
    const entries = deps.blocklistService.getEntries();

    return c.json({ enabled: true, stats, entries });
  });

  admin.post("/api/moderation/block", async (c: Context) => {
    if (!deps.blocklistService) {
      return c.json({ error: "Moderation not enabled" }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { type, value, reason } = body;

    if (!type || !value) {
      return c.json({ error: "type and value are required" }, 400);
    }

    const result = await deps.blocklistService.block(
      type,
      value,
      reason || "Blocked via admin UI",
      "admin-ui",
    );

    return c.json({ ok: true, ...result });
  });

  admin.post("/api/moderation/unblock", async (c: Context) => {
    if (!deps.blocklistService) {
      return c.json({ error: "Moderation not enabled" }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { type, value } = body;

    if (!type || !value) {
      return c.json({ error: "type and value are required" }, 400);
    }

    const removed = await deps.blocklistService.unblock(type, value);
    return c.json({ ok: true, removed });
  });

  // Save .env file — supports merge mode { changes: {} } and legacy { env: "" }
  admin.post("/api/config/save", async (c: Context) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const fs = await import("fs");
    const path = await import("path");
    const envPath = path.resolve(process.cwd(), ".env");

    // Merge mode: { changes: { KEY: "value", ... } }
    if (body.changes && typeof body.changes === "object") {
      const changeKeys = Object.keys(body.changes);
      if (changeKeys.length > 100) {
        return c.json({ error: "Too many changes (max 100)" }, 400);
      }
      const totalSize = changeKeys.reduce(
        (sum, k) => sum + k.length + String(body.changes[k]).length,
        0,
      );
      if (totalSize > 64 * 1024) {
        return c.json({ error: "Payload too large (max 64KB)" }, 413);
      }
      try {
        const changes: Record<string, string> = body.changes;

        // Read existing .env content
        let existingContent = "";
        try {
          existingContent = fs.readFileSync(envPath, "utf-8");
        } catch {
          // File doesn't exist yet, start fresh
        }

        const lines = existingContent.split("\n");
        const updatedKeys = new Set<string>();
        const newLines: string[] = [];

        // Update existing lines
        for (const line of lines) {
          const trimmed = line.trim();
          // Preserve comments and blank lines
          if (trimmed === "" || trimmed.startsWith("#")) {
            newLines.push(line);
            continue;
          }

          // Match KEY=value pattern
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            if (key in changes) {
              // Preserve existing quoting convention
              const existingVal = trimmed.substring(eqIndex + 1);
              const isDoubleQuoted =
                existingVal.startsWith('"') && existingVal.endsWith('"');
              const isSingleQuoted =
                existingVal.startsWith("'") && existingVal.endsWith("'");
              const newVal = changes[key];
              if (isDoubleQuoted) {
                newLines.push(`${key}="${newVal}"`);
              } else if (isSingleQuoted) {
                newLines.push(`${key}='${newVal}'`);
              } else {
                newLines.push(`${key}=${newVal}`);
              }
              updatedKeys.add(key);
              continue;
            }
          }
          newLines.push(line);
        }

        // Append new keys that weren't in existing file
        for (const [key, value] of Object.entries(changes)) {
          if (!updatedKeys.has(key)) {
            newLines.push(`${key}=${value}`);
          }
        }

        // Ensure file ends with newline
        let result = newLines.join("\n");
        if (!result.endsWith("\n")) {
          result += "\n";
        }

        fs.writeFileSync(envPath, result, "utf-8");
        deps.logger.info("Admin UI: .env file saved (merge mode)", {
          keysChanged: Object.keys(changes).length,
        });
        return c.json({ ok: true });
      } catch (err) {
        deps.logger.error("Admin UI: Failed to save .env (merge mode)", {
          error: err instanceof Error ? err.message : String(err),
        });
        return c.json({ error: "Failed to write .env file" }, 500);
      }
    }

    // Legacy mode: { env: "raw string" }
    const envContent = body.env;
    if (typeof envContent !== "string") {
      return c.json(
        { error: "Either 'changes' object or 'env' string required" },
        400,
      );
    }

    if (envContent.length > 64 * 1024) {
      return c.json({ error: "Payload too large (max 64KB)" }, 413);
    }

    try {
      fs.writeFileSync(envPath, envContent, "utf-8");
      deps.logger.info("Admin UI: .env file saved");
      return c.json({ ok: true });
    } catch (err) {
      deps.logger.error("Admin UI: Failed to save .env", {
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "Failed to write .env file" }, 500);
    }
  });

  // Restart API - validate config and restart the router process
  admin.post("/api/restart", async (c: Context) => {
    if (!deps.onRestart) {
      return c.json({ ok: false, error: "Restart not supported" }, 501);
    }

    const result = validateEnvFile();
    if (!result.valid) {
      return c.json({ ok: false, error: result.error }, 400);
    }

    // Respond before restarting so the client receives the response
    setTimeout(() => deps.onRestart?.(), 500);

    return c.json({ ok: true, restarting: true });
  });

  return admin;
}
