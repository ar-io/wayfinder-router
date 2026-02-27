/**
 * Arweave API Handlers
 * Proxy and route handlers for Arweave node HTTP API endpoints
 */

import type { Context } from "hono";
import type { Logger, RouterConfig, RouterMode } from "../types/index.js";
import type { ArweaveApiRequestInfo } from "../types/arweave-api.js";
import { constructArweaveApiPath } from "../types/arweave-api.js";
import type { ArweaveApiFetcher } from "../services/arweave-api-fetcher.js";
import type { ArweaveNodeSelector } from "../services/arweave-node-selector.js";
import type { TelemetryService } from "../telemetry/service.js";
import { addArweaveNodeHeader } from "../utils/headers.js";

export interface ArweaveApiHandlerDeps {
  fetcher: ArweaveApiFetcher;
  nodeSelector: ArweaveNodeSelector;
  config: RouterConfig;
  logger: Logger;
  telemetryService?: TelemetryService | null;
}

/**
 * Create Arweave API proxy handler
 * Fetches data from Arweave node, caches it, and serves to client
 */
export function createArweaveApiProxyHandler(deps: ArweaveApiHandlerDeps) {
  const { fetcher, logger, telemetryService } = deps;

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get("requestInfo") as ArweaveApiRequestInfo;
    const traceId = crypto.randomUUID();
    const startTime = Date.now();

    const { endpoint, params, category, path } = requestInfo;

    logger.debug("Arweave API proxy request", {
      endpoint,
      params,
      category,
      traceId,
    });

    try {
      // Fetch from Arweave node (with caching)
      const result = await fetcher.fetch(
        endpoint,
        params,
        category,
        traceId,
        c.req.raw.headers,
      );

      const latencyMs = Date.now() - startTime;

      logger.info("Arweave API proxy success", {
        endpoint,
        params,
        node: result.node.hostname,
        cached: result.cached,
        latencyMs,
        size: result.data.length,
        traceId,
      });

      // Record telemetry
      if (telemetryService) {
        telemetryService.recordRequest({
          traceId,
          timestamp: startTime,
          gateway: result.node.origin,
          requestType: "arweave-api",
          identifier: endpoint,
          path,
          mode: "proxy",
          outcome: "success",
          httpStatus: 200,
          latency: {
            totalMs: latencyMs,
          },
          bytesReceived: result.data.length,
        });
      }

      // Build response headers
      const responseHeaders = new Headers(result.headers);
      responseHeaders.set("content-type", result.contentType);
      responseHeaders.set("content-length", String(result.data.length));

      // Add wayfinder metadata headers
      responseHeaders.set("x-wayfinder-mode", "proxy");
      if (!result.cached) {
        addArweaveNodeHeader(responseHeaders, result.node);
      }
      if (result.cached) {
        responseHeaders.set("x-wayfinder-cached", "true");
      }

      return new Response(result.data, {
        status: 200,
        headers: responseHeaders,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const latencyMs = Date.now() - startTime;

      logger.error("Arweave API proxy failed", {
        endpoint,
        params,
        error: errorMsg,
        latencyMs,
        traceId,
      });

      // Record telemetry for error
      if (telemetryService) {
        telemetryService.recordRequest({
          traceId,
          timestamp: startTime,
          gateway: "unknown",
          requestType: "arweave-api",
          identifier: endpoint,
          path,
          mode: "proxy",
          outcome: "server_error",
          httpStatus: 502,
          latency: {
            totalMs: latencyMs,
          },
        });
      }

      return c.json(
        {
          error: "Failed to fetch from Arweave node",
          message: errorMsg,
        },
        502,
      );
    }
  };
}

/**
 * Create Arweave API route handler
 * Redirects client to Arweave node URL
 */
export function createArweaveApiRouteHandler(deps: ArweaveApiHandlerDeps) {
  const { nodeSelector, logger, telemetryService } = deps;

  return async (c: Context): Promise<Response> => {
    const requestInfo = c.get("requestInfo") as ArweaveApiRequestInfo;
    const traceId = crypto.randomUUID();
    const startTime = Date.now();

    const { endpoint, params, path } = requestInfo;

    logger.debug("Arweave API route request", {
      endpoint,
      params,
      traceId,
    });

    try {
      // Select a node for read operations (route mode redirects to GET endpoints)
      const node = nodeSelector.select("read");

      // Build the API path
      const apiPath = constructArweaveApiPath(endpoint, params);

      // Build full redirect URL
      const redirectUrl = new URL(apiPath, node);

      const latencyMs = Date.now() - startTime;

      logger.info("Arweave API route redirect", {
        endpoint,
        params,
        node: node.hostname,
        redirectUrl: redirectUrl.toString(),
        latencyMs,
        traceId,
      });

      // Record telemetry
      if (telemetryService) {
        telemetryService.recordRequest({
          traceId,
          timestamp: startTime,
          gateway: node.origin,
          requestType: "arweave-api",
          identifier: endpoint,
          path,
          mode: "route",
          outcome: "success",
          httpStatus: 302,
          latency: {
            totalMs: latencyMs,
          },
        });
      }

      // Create redirect response with node header
      const headers = new Headers();
      headers.set("location", redirectUrl.toString());
      addArweaveNodeHeader(headers, node);
      headers.set("x-wayfinder-mode", "route");

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const latencyMs = Date.now() - startTime;

      logger.error("Arweave API route failed", {
        endpoint,
        params,
        error: errorMsg,
        latencyMs,
        traceId,
      });

      // Record telemetry for error
      if (telemetryService) {
        telemetryService.recordRequest({
          traceId,
          timestamp: startTime,
          gateway: "unknown",
          requestType: "arweave-api",
          identifier: endpoint,
          path,
          mode: "route",
          outcome: "server_error",
          httpStatus: 500,
          latency: {
            totalMs: latencyMs,
          },
        });
      }

      return c.json(
        {
          error: "Failed to select Arweave node",
          message: errorMsg,
        },
        500,
      );
    }
  };
}

/**
 * Unified handler factory that creates the appropriate handler based on mode
 */
export function createArweaveApiHandler(
  deps: ArweaveApiHandlerDeps,
  mode: RouterMode,
) {
  if (mode === "route") {
    return createArweaveApiRouteHandler(deps);
  }
  return createArweaveApiProxyHandler(deps);
}
