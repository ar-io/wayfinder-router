/**
 * Wayfinder Router
 * Entry point for the lightweight ar.io gateway proxy
 */

import pino from "pino";

import { loadConfig, validateConfig } from "./config.js";
import { createServer } from "./server.js";
import { createAdminServer } from "./admin/server.js";
import type { Logger, RouterConfig } from "./types/index.js";
import { createShutdownManager } from "./utils/shutdown-manager.js";
import { openInBrowser } from "./utils/open-browser.js";

/**
 * Create pino logger with configuration
 */
function createLogger(level: string): Logger {
  // Note: pino-pretty transport disabled due to zone.js compatibility issues
  // with wayfinder-core. Use LOG_PRETTY=true to enable if needed.
  const usePretty =
    process.env.LOG_PRETTY === "true" && process.env.NODE_ENV !== "production";

  const pinoLogger = pino({
    level,
    transport: usePretty
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });

  return {
    debug: (msg: string, ...args: unknown[]) =>
      pinoLogger.debug(args[0] as object, msg),
    info: (msg: string, ...args: unknown[]) =>
      pinoLogger.info(args[0] as object, msg),
    warn: (msg: string, ...args: unknown[]) =>
      pinoLogger.warn(args[0] as object, msg),
    error: (msg: string, ...args: unknown[]) =>
      pinoLogger.error(args[0] as object, msg),
    child: (_bindings: Record<string, unknown>) => {
      const childLogger = pinoLogger.child(_bindings);
      return {
        debug: (msg: string, ...args: unknown[]) =>
          childLogger.debug(args[0] as object, msg),
        info: (msg: string, ...args: unknown[]) =>
          childLogger.info(args[0] as object, msg),
        warn: (msg: string, ...args: unknown[]) =>
          childLogger.warn(args[0] as object, msg),
        error: (msg: string, ...args: unknown[]) =>
          childLogger.error(args[0] as object, msg),
        child: (__bindings: Record<string, unknown>) => createLogger(level),
      };
    },
  };
}

/**
 * Setup global error handlers for unhandled rejections and uncaught exceptions.
 * These handlers catch errors that would otherwise crash the process or leave it
 * in an undefined state.
 */
function setupGlobalErrorHandlers(logger: Logger, config: RouterConfig): void {
  // Track if we're already in shutdown mode to prevent duplicate handling
  let isExiting = false;

  /**
   * Handle unhandled promise rejections.
   * These occur when a Promise is rejected and no .catch() handler is attached.
   */
  process.on("unhandledRejection", (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));

    logger.error("Unhandled promise rejection", {
      error: error.message,
      stack: error.stack,
    });

    if (config.errorHandling.exitOnUnhandledRejection && !isExiting) {
      isExiting = true;
      logger.error(
        "Exiting due to unhandled rejection (EXIT_ON_UNHANDLED_REJECTION=true)",
      );

      // Allow time for logs to flush before exiting
      setTimeout(() => {
        process.exit(1);
      }, config.errorHandling.exitGracePeriodMs);
    }
  });

  /**
   * Handle uncaught exceptions.
   * After an uncaughtException, the process is in an undefined state
   * and should generally exit to prevent unpredictable behavior.
   */
  process.on("uncaughtException", (error: Error, origin: string) => {
    // Use console.error as fallback in case logger itself is broken
    try {
      logger.error("Uncaught exception", {
        error: error.message,
        stack: error.stack,
        origin,
      });
    } catch {
      console.error("Uncaught exception (logger failed):", error);
    }

    if (config.errorHandling.exitOnUncaughtException && !isExiting) {
      isExiting = true;

      try {
        logger.error(
          "Exiting due to uncaught exception (EXIT_ON_UNCAUGHT_EXCEPTION=true)",
        );
      } catch {
        console.error("Exiting due to uncaught exception");
      }

      // Allow time for logs to flush before exiting
      setTimeout(() => {
        process.exit(1);
      }, config.errorHandling.exitGracePeriodMs);
    }
  });

  logger.debug("Global error handlers registered", {
    exitOnUnhandledRejection: config.errorHandling.exitOnUnhandledRejection,
    exitOnUncaughtException: config.errorHandling.exitOnUncaughtException,
    exitGracePeriodMs: config.errorHandling.exitGracePeriodMs,
  });
}

/**
 * Main entry point
 */
async function main() {
  // Load and validate configuration
  const config = loadConfig();
  const logger = createLogger(config.logging.level);

  // Setup global error handlers early (before any async operations)
  setupGlobalErrorHandlers(logger, config);

  try {
    validateConfig(config);
  } catch (error) {
    logger.error("Configuration validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  logger.info("Starting Wayfinder Router", {
    port: config.server.port,
    host: config.server.host,
    baseDomain: config.server.baseDomain,
    mode: config.mode.default,
    verificationEnabled: config.verification.enabled,
    routingStrategy: config.routing.strategy,
    gatewaySource: config.routing.gatewaySource,
  });

  // Create server
  const { app, services, startTime } = createServer({ config, logger });

  // Initialize network gateway manager if using network/top-staked sources
  if (services.networkGatewayManager) {
    logger.info("Initializing network gateway manager from ar.io network...");
    await services.networkGatewayManager.initialize();
  }

  // Initialize blocklist service for content moderation
  if (services.blocklistService) {
    logger.info("Initializing content moderation blocklist...");
    await services.blocklistService.initialize();
  }

  // Start server first - don't block on ping service
  // The temperature cache works fine without ping data (uses default scores)
  // and will improve as ping data populates in the background
  const server = Bun.serve({
    fetch(req, srv) {
      return app.fetch(req, { server: srv });
    },
    port: config.server.port,
    hostname: config.server.host,
  });

  const displayHost = (host: string) =>
    host === "0.0.0.0" || host === "::" ? "localhost" : host;

  logger.info("Wayfinder Router started", {
    url: `http://${displayHost(config.server.host)}:${config.server.port}`,
  });

  // Start admin UI server on separate port (localhost-only by default)
  let adminServer: ReturnType<typeof Bun.serve> | null = null;
  if (config.admin.enabled) {
    const restartFn = () => {
      logger.info("Restart requested via admin UI");
      try {
        const proc = Bun.spawn([process.execPath, ...process.argv.slice(1)], {
          stdio: ["inherit", "inherit", "inherit"],
        });
        proc.unref();
      } catch (e) {
        logger.warn("Could not spawn replacement, relying on process manager", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      // Tear down
      if (adminServer) adminServer.stop();
      if (services.pingService) services.pingService.stop();
      if (services.networkGatewayManager) services.networkGatewayManager.stop();
      if (services.telemetryService) services.telemetryService.stop();
      server.stop();
      process.exit(0);
    };

    const { app: adminApp } = createAdminServer({
      config,
      logger,
      services,
      startTime,
      onRestart: restartFn,
    });

    adminServer = Bun.serve({
      fetch: adminApp.fetch,
      port: config.admin.port,
      hostname: config.admin.host,
    });

    logger.info("Admin UI started", {
      url: `http://${displayHost(config.admin.host)}:${config.admin.port}`,
    });

    if (config.admin.openBrowser) {
      openInBrowser(`http://localhost:${config.admin.port}`, logger);
    }
  }

  // Initialize ping service in background (non-blocking)
  // The initial ping round will run while the server is already accepting requests
  if (services.pingService) {
    logger.info("Starting gateway ping service in background...");
    services.pingService.initialize().catch((error) => {
      logger.warn("Gateway ping service initialization failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // Setup graceful shutdown with request draining
  createShutdownManager({
    server,
    requestTracker: services.requestTracker,
    logger,
    drainTimeoutMs: config.shutdown.drainTimeoutMs,
    shutdownTimeoutMs: config.shutdown.shutdownTimeoutMs,
    onBeforeServerClose: async () => {
      // Stop admin server
      if (adminServer) {
        logger.info("Stopping admin UI server");
        adminServer.stop();
      }

      // Stop ping service first (it depends on network manager)
      if (services.pingService) {
        logger.info("Stopping gateway ping service");
        services.pingService.stop();
      }

      // Stop network gateway manager
      if (services.networkGatewayManager) {
        logger.info("Stopping network gateway manager");
        services.networkGatewayManager.stop();
      }

      // Stop telemetry service to flush pending events and close database
      if (services.telemetryService) {
        logger.info("Stopping telemetry service");
        services.telemetryService.stop();
      }

      // Stop blocklist service (close file watcher)
      if (services.blocklistService) {
        logger.info("Stopping blocklist service");
        await services.blocklistService.stop();
      }

      // Close HTTP connection pools
      logger.info("Closing HTTP connection pools");
      await services.httpClient.close();
    },
  });

  logger.info("Graceful shutdown manager initialized", {
    drainTimeoutMs: config.shutdown.drainTimeoutMs,
    shutdownTimeoutMs: config.shutdown.shutdownTimeoutMs,
  });
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
