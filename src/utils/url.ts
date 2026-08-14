/**
 * URL utilities for Wayfinder Router
 */

// Transaction ID regex - exactly 43 base64url characters
const TX_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;

// ArNS name regex - 1-51 characters, lowercase alphanumeric with hyphens/underscores
// Note: ArNS names are case-insensitive, we normalize to lowercase
const ARNS_NAME_REGEX = /^[a-z0-9_-]{1,51}$/i;

// Sandbox subdomain regex - exactly 52 lowercase base32 characters
// Base32 uses A-Z and 2-7, but ar.io uses lowercase
const SANDBOX_REGEX = /^[a-z2-7]{52}$/;

/**
 * Check if a string is a valid Arweave transaction ID
 */
export function isTxId(value: string): boolean {
  return TX_ID_REGEX.test(value);
}

/**
 * Check if a string is a valid ArNS name
 */
export function isArnsName(value: string): boolean {
  // ArNS names are 1-51 chars but exclude 43-char strings (those are txIds)
  if (value.length === 43 && TX_ID_REGEX.test(value)) {
    return false;
  }
  return ARNS_NAME_REGEX.test(value);
}

/**
 * Check if a subdomain is a valid sandbox subdomain
 * Sandbox subdomains are 52 lowercase base32 characters derived from a txId
 */
export function isValidSandbox(subdomain: string): boolean {
  return SANDBOX_REGEX.test(subdomain);
}

/**
 * Validate that a sandbox subdomain is correctly derived from a transaction ID
 * Returns true if the sandbox matches what would be generated from the txId
 */
export function validateSandboxForTxId(sandbox: string, txId: string): boolean {
  if (!isValidSandbox(sandbox) || !isTxId(txId)) {
    return false;
  }
  const expectedSandbox = sandboxFromTxId(txId);
  return sandbox === expectedSandbox;
}

/**
 * Decode base64url string to bytes
 */
function fromBase64Url(base64url: string): Uint8Array {
  // Convert base64url to standard base64
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  // Decode
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate sandbox subdomain from transaction ID
 * ar.io gateways use base32 encoding of the base64url-decoded txId
 */
export function sandboxFromTxId(txId: string): string {
  // Decode the base64url txId to raw bytes, then base32 encode
  const bytes = fromBase64Url(txId);
  return base32Encode(bytes).toLowerCase();
}

/**
 * Base32 encode (RFC 4648, no padding)
 */
function base32Encode(data: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Assign a "/path?query" string to a URL.
 *
 * The request parser carries the query string inside `path` (it builds
 * `pathname + search`). Assigning that straight to `url.pathname` makes the
 * WHATWG URL setter percent-encode the "?" as "%3F", which turns the query
 * into a literal path segment — upstream gateways then get a bogus path and
 * the caller's query parameters are lost. Split the two parts instead.
 */
function applyPathWithQuery(url: URL, pathWithQuery: string): void {
  const queryIndex = pathWithQuery.indexOf("?");

  if (queryIndex === -1) {
    url.pathname = pathWithQuery;
    return;
  }

  url.pathname = pathWithQuery.slice(0, queryIndex);
  url.search = pathWithQuery.slice(queryIndex + 1);
}

/**
 * Construct gateway URL for a transaction
 */
export function constructGatewayUrl(params: {
  gateway: URL;
  txId: string;
  path: string;
  useSubdomain?: boolean;
}): URL {
  const { gateway, txId, path, useSubdomain = true } = params;

  // For localhost, always use path-based routing
  if (gateway.hostname === "localhost" || gateway.hostname === "127.0.0.1") {
    const url = new URL(gateway);
    applyPathWithQuery(url, `/${txId}${path}`);
    return url;
  }

  if (useSubdomain) {
    // Use sandbox subdomain for transaction isolation
    // The txId must still be in the path to fetch the actual content
    const sandbox = sandboxFromTxId(txId);
    const url = new URL(gateway);
    url.hostname = `${sandbox}.${url.hostname}`;
    applyPathWithQuery(url, `/${txId}${path}`);
    return url;
  }

  // Path-based routing
  const url = new URL(gateway);
  applyPathWithQuery(url, `/${txId}${path}`);
  return url;
}

/**
 * Construct gateway URL for ArNS name
 */
export function constructArnsGatewayUrl(params: {
  gateway: URL;
  arnsName: string;
  path: string;
}): URL {
  const { gateway, arnsName, path } = params;

  // For localhost, use path-based routing
  if (gateway.hostname === "localhost" || gateway.hostname === "127.0.0.1") {
    const url = new URL(gateway);
    applyPathWithQuery(url, `/${arnsName}${path}`);
    return url;
  }

  // Use ArNS name as subdomain
  const url = new URL(gateway);
  url.hostname = `${arnsName.toLowerCase()}.${url.hostname}`;
  applyPathWithQuery(url, path || "/");
  return url;
}

/**
 * Normalize a path (ensure leading slash, handle empty)
 */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}
