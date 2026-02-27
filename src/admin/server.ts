/**
 * Admin UI Server
 * Runs on a separate port from the public router.
 * Bound to 127.0.0.1 by default (localhost-only access).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Logger, RouterConfig } from "../types/index.js";
import type { RouterServices } from "../server.js";
import { createAdminRoutes } from "./handler.js";
import packageJson from "../../package.json" with { type: "json" };

const ROUTER_VERSION: string = packageJson.version;

/** Constant-time string comparison to prevent timing attacks.
 *  Uses HMAC so both sides are always the same length,
 *  avoiding any early-exit that could leak the token length. */
function safeCompare(a: string, b: string): boolean {
  const key = "wayfinder-auth";
  const ha = createHmac("sha256", key).update(a).digest();
  const hb = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface AdminServerOptions {
  config: RouterConfig;
  logger: Logger;
  services: RouterServices;
  startTime: number;
  onRestart?: () => void;
}

export function createAdminServer(options: AdminServerOptions) {
  const { config, logger, services } = options;

  const app = new Hono();

  // CORS for admin UI
  app.use("*", cors());

  // Token auth middleware (when ADMIN_TOKEN is set)
  if (config.admin.token) {
    const expectedToken = config.admin.token;
    const authFailures = new Map<
      string,
      { count: number; blockedUntil: number }
    >();

    app.use("/api/*", async (c, next) => {
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0].trim() || "unknown";
      const now = Date.now();

      const authHeader = c.req.header("Authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      const validToken = !!token && safeCompare(token, expectedToken);

      if (validToken) {
        // Valid token always gets through; clear any failures
        authFailures.delete(ip);
        return next();
      }

      // Invalid token — check if IP is temporarily blocked
      const failure = authFailures.get(ip);
      if (failure && failure.blockedUntil > now) {
        return c.json({ error: "Too many auth attempts" }, 429);
      }

      // Record failure
      const f = failure || { count: 0, blockedUntil: 0 };
      f.count++;
      if (f.count >= 5) {
        f.blockedUntil = now + 60_000;
        f.count = 0;
      }
      authFailures.set(ip, f);
      return c.json({ error: "Unauthorized" }, 401);
    });
  }

  // Mount admin routes
  const adminRoutes = createAdminRoutes({
    config,
    logger,
    version: ROUTER_VERSION,
    startTime: options.startTime,
    gatewaySelector: services.gatewaySelector,
    telemetryService: services.telemetryService,
    contentCache: services.contentCache,
    pingService: services.pingService,
    blocklistService: services.blocklistService,
    wayfinderServices: services.wayfinderServices,
    onRestart: options.onRestart,
  });

  app.route("/", adminRoutes);

  return { app };
}
