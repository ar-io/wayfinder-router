/**
 * Request parsing middleware for Wayfinder Router
 * Extracts ArNS names, transaction IDs, and sandbox subdomains from incoming requests
 */

import type { Context, Next } from "hono";
import type { RequestInfo, RouterConfig } from "../types/index.js";
import type {
  ArweaveApiEndpoint,
  ArweaveApiRequestInfo,
} from "../types/arweave-api.js";
import { VALID_TX_FIELDS, getEndpointCategory } from "../types/arweave-api.js";
import { isTxId, normalizePath, isValidSandbox } from "../utils/url.js";

// Reserved paths that should not be treated as transaction IDs or ArNS paths
// These are always handled by the router itself
const RESERVED_PATHS = new Set(["favicon.ico", "graphql"]);

// Reserved path prefixes - paths starting with these are always reserved
// All router endpoints are under /wayfinder/ (health, ready, metrics, stats, info)
const RESERVED_PREFIXES = ["wayfinder/", "ar-io/"];

/**
 * Check if a path is reserved (should be handled by the router, not proxied)
 */
function isReservedPath(pathname: string): boolean {
  const pathWithoutLeadingSlash = pathname.startsWith("/")
    ? pathname.slice(1)
    : pathname;
  const firstSegment = pathWithoutLeadingSlash.split("/")[0]?.toLowerCase();

  // Check exact reserved paths
  if (firstSegment && RESERVED_PATHS.has(firstSegment)) {
    return true;
  }

  // Check reserved prefixes
  const lowerPath = pathWithoutLeadingSlash.toLowerCase();
  for (const prefix of RESERVED_PREFIXES) {
    if (lowerPath.startsWith(prefix) || lowerPath === prefix.slice(0, -1)) {
      return true;
    }
  }

  return false;
}

// Regex patterns for Arweave API endpoints
// Transaction ID: 43 base64url characters
const TX_ID_PATTERN = "[A-Za-z0-9_-]{43}";
// Block hash: 64 hex characters (SHA-256)
const BLOCK_HASH_PATTERN = "[A-Za-z0-9_-]{64}";
// Wallet address: 43 base64url characters (same as txId)
const WALLET_ADDR_PATTERN = "[A-Za-z0-9_-]{43}";

/**
 * Parse Arweave API paths
 * Returns ArweaveApiRequestInfo if path matches an Arweave API endpoint, null otherwise
 */
function parseArweaveApiPath(pathname: string): ArweaveApiRequestInfo | null {
  // Remove leading slash for easier matching
  const path = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const segments = path.split("/");

  // /info
  if (path === "info") {
    return createArweaveApiRequest("info", {}, pathname);
  }

  // /peers
  if (path === "peers") {
    return createArweaveApiRequest("peers", {}, pathname);
  }

  // /tx/{id}... endpoints
  if (segments[0] === "tx" && segments.length >= 2) {
    const txId = segments[1];

    // Validate txId format (43 base64url chars)
    if (!txId || !new RegExp(`^${TX_ID_PATTERN}$`).test(txId)) {
      return null;
    }

    // /tx/{id}
    if (segments.length === 2) {
      return createArweaveApiRequest("tx", { id: txId }, pathname);
    }

    // /tx/{id}/status
    if (segments.length === 3 && segments[2] === "status") {
      return createArweaveApiRequest("tx-status", { id: txId }, pathname);
    }

    // /tx/{id}/offset
    if (segments.length === 3 && segments[2] === "offset") {
      return createArweaveApiRequest("tx-offset", { id: txId }, pathname);
    }

    // /tx/{id}/data or /tx/{id}/data.{extension}
    if (segments.length === 3 && segments[2].startsWith("data")) {
      const dataSegment = segments[2];
      if (dataSegment === "data") {
        return createArweaveApiRequest("tx-data", { id: txId }, pathname);
      }
      // Check for data.{extension} pattern
      const extMatch = dataSegment.match(/^data\.(\w+)$/);
      if (extMatch) {
        return createArweaveApiRequest(
          "tx-data",
          { id: txId, extension: extMatch[1] },
          pathname,
        );
      }
    }

    // /tx/{id}/{field} - must be a valid field name
    if (segments.length === 3) {
      const field = segments[2];
      if (VALID_TX_FIELDS.has(field)) {
        return createArweaveApiRequest(
          "tx-field",
          { id: txId, field },
          pathname,
        );
      }
    }

    return null;
  }

  // /wallet/{address}/... endpoints
  if (segments[0] === "wallet" && segments.length === 3) {
    const address = segments[1];

    // Validate address format (43 base64url chars)
    if (!address || !new RegExp(`^${WALLET_ADDR_PATTERN}$`).test(address)) {
      return null;
    }

    // /wallet/{address}/balance
    if (segments[2] === "balance") {
      return createArweaveApiRequest("wallet-balance", { address }, pathname);
    }

    // /wallet/{address}/last_tx
    if (segments[2] === "last_tx") {
      return createArweaveApiRequest("wallet-last-tx", { address }, pathname);
    }

    return null;
  }

  // /price/{bytes} or /price/{bytes}/{target}
  if (segments[0] === "price" && segments.length >= 2) {
    const bytes = segments[1];

    // Validate bytes is a positive integer
    if (!bytes || !/^\d+$/.test(bytes)) {
      return null;
    }

    // /price/{bytes}
    if (segments.length === 2) {
      return createArweaveApiRequest("price", { bytes }, pathname);
    }

    // /price/{bytes}/{target}
    if (segments.length === 3) {
      const target = segments[2];
      // Validate target format (43 base64url chars)
      if (new RegExp(`^${WALLET_ADDR_PATTERN}$`).test(target)) {
        return createArweaveApiRequest(
          "price-target",
          { bytes, target },
          pathname,
        );
      }
    }

    return null;
  }

  // /block/hash/{hash} or /block/height/{height}
  if (segments[0] === "block" && segments.length === 3) {
    // /block/hash/{hash}
    if (segments[1] === "hash") {
      const hash = segments[2];
      // Block hash is 64 characters (indep_hash)
      if (hash && new RegExp(`^${BLOCK_HASH_PATTERN}$`).test(hash)) {
        return createArweaveApiRequest("block-hash", { hash }, pathname);
      }
    }

    // /block/height/{height}
    if (segments[1] === "height") {
      const height = segments[2];
      // Height must be a non-negative integer
      if (height && /^\d+$/.test(height)) {
        return createArweaveApiRequest("block-height", { height }, pathname);
      }
    }

    return null;
  }

  return null;
}

/**
 * Helper to create ArweaveApiRequestInfo
 */
function createArweaveApiRequest(
  endpoint: ArweaveApiEndpoint,
  params: Record<string, string>,
  path: string,
): ArweaveApiRequestInfo {
  return {
    type: "arweave-api",
    endpoint,
    category: getEndpointCategory(endpoint),
    params,
    path,
  };
}

/**
 * Parse the incoming request to extract routing information
 * @param url - The request URL
 * @param hostname - The request hostname
 * @param baseDomain - The base domain for the router
 * @param rootHostContent - Optional content (ArNS name or txId) to serve at root domain
 * @param restrictToRootHost - When true, blocks subdomain and txId path requests
 */
export function parseRequest(
  url: URL,
  hostname: string,
  baseDomain: string,
  rootHostContent?: string,
  restrictToRootHost: boolean = false,
): RequestInfo {
  // Normalize the base domain (remove port if present in comparison)
  const baseHost = baseDomain.split(":")[0].toLowerCase();
  const requestHost = hostname.split(":")[0].toLowerCase();

  // Check for subdomain: {subdomain}.wayfinder-router.com
  if (requestHost !== baseHost && requestHost.endsWith(`.${baseHost}`)) {
    const subdomain = requestHost.slice(0, -(baseHost.length + 1));

    // Validate it's not empty and doesn't contain additional subdomains
    if (subdomain && !subdomain.includes(".")) {
      // If restriction mode is enabled, block all subdomain requests
      if (restrictToRootHost) {
        return {
          type: "blocked",
          reason: "subdomain_restricted",
          path: url.pathname,
        };
      }
      // Check if this is a sandbox subdomain (52 char base32)
      if (isValidSandbox(subdomain)) {
        // Sandbox request - extract txId from path
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const firstSegment = pathSegments[0];

        // Check reserved paths first
        if (isReservedPath(url.pathname)) {
          return {
            type: "reserved",
            path: url.pathname,
          };
        }

        // Sandbox requests should have txId in path
        if (firstSegment && isTxId(firstSegment)) {
          const remainingPath = "/" + pathSegments.slice(1).join("/");
          return {
            type: "txid",
            txId: firstSegment,
            path: normalizePath(remainingPath + url.search),
            sandboxSubdomain: subdomain,
          };
        }

        // Sandbox without valid txId in path - treat as reserved
        return {
          type: "reserved",
          path: url.pathname,
        };
      }

      // Not a sandbox - treat as ArNS name
      return {
        type: "arns",
        arnsName: subdomain.toLowerCase(),
        path: normalizePath(url.pathname + url.search),
      };
    }
  }

  // No subdomain - check for transaction ID path: /{txId}/...
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const firstSegment = pathSegments[0];

  // Check reserved paths first (health, ready, metrics, wayfinder/*, stats/*)
  if (isReservedPath(url.pathname)) {
    return {
      type: "reserved",
      path: url.pathname,
    };
  }

  // Check Arweave API paths BEFORE txId check (only on root domain)
  // This is critical because /tx/{id} would otherwise match as content request
  if (requestHost === baseHost) {
    const arweaveApi = parseArweaveApiPath(url.pathname);
    if (arweaveApi) {
      return arweaveApi;
    }
  }

  // Check if first segment is a valid transaction ID (exactly 43 base64url chars)
  if (firstSegment && isTxId(firstSegment)) {
    // If restriction mode is enabled, block txId path requests
    if (restrictToRootHost) {
      return {
        type: "blocked",
        reason: "txid_path_restricted",
        path: url.pathname,
      };
    }

    const remainingPath = "/" + pathSegments.slice(1).join("/");
    return {
      type: "txid",
      txId: firstSegment,
      path: normalizePath(remainingPath + url.search),
      // No sandbox subdomain - will need redirect
    };
  }

  // No txId found - check if we should route to rootHostContent
  if (rootHostContent) {
    // Auto-detect: is it a txId or ArNS name?
    if (isTxId(rootHostContent)) {
      // It's a transaction ID - route as txid request
      return {
        type: "txid",
        txId: rootHostContent,
        path: normalizePath(url.pathname + url.search),
      };
    } else {
      // It's an ArNS name - route as arns request
      return {
        type: "arns",
        arnsName: rootHostContent.toLowerCase(),
        path: normalizePath(url.pathname + url.search),
      };
    }
  }

  // No root host content configured - treat as reserved (will show info page)
  return {
    type: "reserved",
    path: url.pathname,
  };
}

/**
 * Create request parser middleware
 */
export function createRequestParserMiddleware(config: RouterConfig) {
  return async (c: Context, next: Next) => {
    const url = new URL(c.req.url);
    const hostname = c.req.header("host") || url.hostname;

    const requestInfo = parseRequest(
      url,
      hostname,
      config.server.baseDomain,
      config.server.rootHostContent || undefined,
      config.server.restrictToRootHost,
    );

    // Store parsed info in context for handlers
    c.set("requestInfo", requestInfo);

    await next();
  };
}
