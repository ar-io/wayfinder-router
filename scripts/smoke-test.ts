#!/usr/bin/env bun
/**
 * Wayfinder Router Smoke Test
 *
 * Runs against a live wayfinder-router instance to validate it's functioning.
 * Uses native fetch and process.exit — no test framework required.
 *
 * Usage:
 *   bun scripts/smoke-test.ts [base-url] [options]
 *
 * Arguments:
 *   base-url              Base URL of the router (default: http://localhost:3000)
 *
 * Options:
 *   --admin-url URL       Admin UI URL (default: http://localhost:3001)
 *   --admin-token TOKEN   Bearer token for admin API
 *   --skip-arns           Skip ArNS subdomain test
 *   --base-domain DOMAIN  Base domain for ArNS test (default: extracted from base-url)
 *   --help, -h            Show this help message
 */

// ANSI color codes
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

interface Options {
  baseUrl: string;
  adminUrl: string;
  adminToken: string | undefined;
  skipArns: boolean;
  baseDomain: string;
  arnsName: string;
  txId: string | undefined;
  checkArweaveApi: boolean;
  checkGraphql: boolean;
  help: boolean;
}

interface CheckResult {
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    baseUrl: "http://localhost:3000",
    adminUrl: "http://localhost:3001",
    adminToken: undefined,
    skipArns: false,
    baseDomain: "",
    arnsName: "ardrive",
    // No default txId: a hardcoded one silently rots when the transaction is
    // no longer served, turning a real check into a false pass.
    txId: undefined,
    checkArweaveApi: false,
    checkGraphql: false,
    help: false,
  };

  let baseUrlSet = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--admin-url":
        options.adminUrl = args[++i];
        break;
      case "--admin-token":
        options.adminToken = args[++i];
        break;
      case "--skip-arns":
        options.skipArns = true;
        break;
      case "--base-domain":
        options.baseDomain = args[++i];
        break;
      case "--arns-name":
        options.arnsName = args[++i];
        break;
      case "--tx-id":
        options.txId = args[++i];
        break;
      case "--arweave-api":
        options.checkArweaveApi = true;
        break;
      case "--graphql":
        options.checkGraphql = true;
        break;
      case "--all":
        options.checkArweaveApi = true;
        options.checkGraphql = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        // First positional argument is the base URL
        if (!baseUrlSet && !args[i].startsWith("--")) {
          options.baseUrl = args[i];
          baseUrlSet = true;
        }
        break;
    }
  }

  // Strip trailing slash from URLs
  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  options.adminUrl = options.adminUrl.replace(/\/+$/, "");

  // Extract base domain from base URL if not explicitly set. An IP literal
  // cannot carry an ArNS subdomain, so fall back to the router's own default.
  if (!options.baseDomain) {
    try {
      const url = new URL(options.baseUrl);
      const isIpLiteral =
        /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) ||
        url.hostname.includes(":");
      options.baseDomain = isIpLiteral ? "localhost" : url.hostname;
    } catch {
      options.baseDomain = "localhost";
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Wayfinder Router Smoke Test

Runs against a live wayfinder-router instance to validate it's functioning.

Usage:
  bun scripts/smoke-test.ts [base-url] [options]

Arguments:
  base-url              Base URL of the router (default: http://localhost:3000)

Options:
  --admin-url URL       Admin UI URL (default: http://localhost:3001)
  --admin-token TOKEN   Bearer token for admin API
  --skip-arns           Skip ArNS, verification, route-mode and manifest tests
  --base-domain DOMAIN  Base domain for ArNS test (default: extracted from base-url)
  --arns-name NAME      ArNS name to exercise (default: ardrive)
  --tx-id ID            Transaction ID for the proxy/sandbox test (default: skipped)
  --arweave-api         Also check the Arweave HTTP API proxy (needs ARWEAVE_API_ENABLED)
  --graphql             Also check the GraphQL proxy (needs GRAPHQL_PROXY_URL)
  --all                 Enable both --arweave-api and --graphql
  --help, -h            Show this help message

Notes:
  ArNS and sandbox requests are addressed by Host header rather than DNS, so
  wildcard "*.localhost" resolution is not required.

Examples:
  bun scripts/smoke-test.ts
  bun scripts/smoke-test.ts http://my-router.example.com:3000
  bun scripts/smoke-test.ts --skip-arns
  bun scripts/smoke-test.ts --admin-url http://localhost:3001 --admin-token secret123
  bun scripts/smoke-test.ts http://127.0.0.1:3000 --base-domain localhost --all
`);
}

const TIMEOUT_MS = 10_000;

// Content checks fetch from real gateways and verify against several more, so
// they need a longer budget than the local management endpoints.
const CONTENT_TIMEOUT_MS = 60_000;

async function runCheck(
  name: string,
  fn: () => Promise<void>,
): Promise<CheckResult> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    const result: CheckResult = { name, passed: true, durationMs };
    printResult(result);
    return result;
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    const detail =
      err instanceof Error ? err.message : String(err);
    const result: CheckResult = { name, passed: false, durationMs, detail };
    printResult(result);
    return result;
  }
}

async function checkHealth(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/wayfinder/health`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  const body = await res.json();
  if (!body || typeof body !== "object" || !("status" in body)) {
    throw new Error('Response body missing "status" field');
  }
}

async function checkReady(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/wayfinder/ready`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
}

async function checkMetrics(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/wayfinder/metrics`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  const body = await res.text();
  if (!body.includes("wayfinder")) {
    throw new Error('Response body does not contain "wayfinder"');
  }
}

async function checkInfo(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/wayfinder/info`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  const body = await res.json();
  if (!body || typeof body !== "object" || !("name" in body)) {
    throw new Error('Response body missing "name" field');
  }
}

/**
 * Fetch the router by address while presenting a different Host header.
 *
 * ArNS and sandbox requests are addressed by subdomain, but `*.localhost`
 * does not resolve on every platform (notably Windows). Connecting to the
 * router's own address and overriding Host exercises the same routing without
 * depending on wildcard DNS.
 */
async function fetchAsHost(
  baseUrl: string,
  host: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
    redirect: "manual",
    ...init,
    headers: { Host: host, ...(init.headers ?? {}) },
  });
}

/**
 * A txId request on the base domain redirects to a sandbox subdomain for
 * origin isolation, so the check follows that hop before asserting content.
 */
async function checkTxFetch(
  baseUrl: string,
  baseDomain: string,
  txId: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const rootHost = port ? `${baseDomain}:${port}` : baseDomain;

  const redirect = await fetchAsHost(baseUrl, rootHost, `/${txId}`);
  if (redirect.status !== 302) {
    throw new Error(`Expected 302 to sandbox subdomain, got ${redirect.status}`);
  }

  const location = redirect.headers.get("location");
  if (!location) {
    throw new Error("Sandbox redirect missing Location header");
  }

  // Follow the sandbox hop by Host header rather than by DNS.
  const sandboxUrl = new URL(location);
  const res = await fetchAsHost(
    baseUrl,
    sandboxUrl.host,
    sandboxUrl.pathname + sandboxUrl.search,
  );

  if (res.status !== 200) {
    throw new Error(`Expected 200 from sandbox host, got ${res.status}`);
  }
  if (res.headers.get("x-wayfinder-mode") !== "proxy") {
    throw new Error(
      `Expected x-wayfinder-mode: proxy, got ${res.headers.get("x-wayfinder-mode")}`,
    );
  }
  const body = await res.arrayBuffer();
  if (body.byteLength === 0) {
    throw new Error("Proxied transaction returned an empty body");
  }
}

async function checkArns(
  baseUrl: string,
  baseDomain: string,
  arnsName: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const host = port
    ? `${arnsName}.${baseDomain}:${port}`
    : `${arnsName}.${baseDomain}`;

  const res = await fetchAsHost(baseUrl, host, "/");

  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  if (res.headers.get("x-arns-resolved-id") === null) {
    throw new Error('Response missing "x-arns-resolved-id" header');
  }
  const body = await res.arrayBuffer();
  if (body.byteLength === 0) {
    throw new Error("ArNS resolution returned an empty body");
  }
}

/**
 * Verification is the router's core promise, so assert it actually ran and
 * names the gateways it checked against — not merely that content came back.
 */
async function checkVerification(
  baseUrl: string,
  baseDomain: string,
  arnsName: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const host = port
    ? `${arnsName}.${baseDomain}:${port}`
    : `${arnsName}.${baseDomain}`;

  const res = await fetchAsHost(baseUrl, host, "/");
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }

  const verified = res.headers.get("x-wayfinder-verified");
  if (verified !== "true") {
    throw new Error(`Expected x-wayfinder-verified: true, got ${verified}`);
  }

  // A cache hit is legitimately served without re-listing verifier gateways.
  if (res.headers.get("x-wayfinder-cached") === "true") {
    return;
  }
  if (!res.headers.get("x-wayfinder-verified-by")) {
    throw new Error('Verified response missing "x-wayfinder-verified-by"');
  }
}

/**
 * Route mode must redirect rather than proxy, and must not mangle the query
 * string into the path (a "?" encoded as "%3F" silently breaks the target).
 */
async function checkRouteMode(
  baseUrl: string,
  baseDomain: string,
  arnsName: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const host = port
    ? `${arnsName}.${baseDomain}:${port}`
    : `${arnsName}.${baseDomain}`;

  const res = await fetchAsHost(baseUrl, host, "/?mode=route&smoke=1");

  if (res.status !== 302) {
    throw new Error(`Expected 302 redirect, got ${res.status}`);
  }

  const location = res.headers.get("location");
  if (!location) {
    throw new Error("Route mode response missing Location header");
  }
  if (location.includes("%3F")) {
    throw new Error(
      `Query string was encoded into the path: ${location}`,
    );
  }

  const target = new URL(location);
  if (target.searchParams.get("smoke") !== "1") {
    throw new Error(`Query parameters lost in redirect: ${location}`);
  }
}

/**
 * Manifest-backed paths resolve a subpath through the manifest and verify the
 * resulting data item against the manifest txId.
 */
async function checkManifestSubpath(
  baseUrl: string,
  baseDomain: string,
  arnsName: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const host = port
    ? `${arnsName}.${baseDomain}:${port}`
    : `${arnsName}.${baseDomain}`;

  const res = await fetchAsHost(baseUrl, host, "/index.html");

  if (res.status !== 200) {
    throw new Error(`Expected 200 for /index.html, got ${res.status}`);
  }
  if (!res.headers.get("x-wayfinder-manifest-txid")) {
    throw new Error('Response missing "x-wayfinder-manifest-txid" header');
  }
}

/**
 * Reserved Arweave API paths are only recognised on the router's own base
 * domain; a mismatched Host falls through to root-host content. Address this
 * check the way a real deployment is addressed.
 */
async function checkArweaveApi(
  baseUrl: string,
  baseDomain: string,
): Promise<void> {
  const port = new URL(baseUrl).port;
  const rootHost = port ? `${baseDomain}:${port}` : baseDomain;

  const res = await fetchAsHost(baseUrl, rootHost, "/info", {
    redirect: "follow",
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body.height !== "number") {
    throw new Error('Arweave /info missing numeric "height"');
  }
}

async function checkGraphql(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query { transactions(first: 1) { edges { node { id } } } }",
    }),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
  const body = (await res.json()) as any;
  if (!body?.data?.transactions) {
    throw new Error("GraphQL response missing data.transactions");
  }
}

async function checkAdmin(
  adminUrl: string,
  adminToken: string | undefined,
): Promise<void> {
  const headers: Record<string, string> = {};
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }
  const res = await fetch(`${adminUrl}/api/status`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers,
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`);
  }
}

function printResult(result: CheckResult): void {
  const tag = result.passed
    ? `${GREEN}PASS${RESET}`
    : `${RED}FAIL${RESET}`;
  const timing = `${DIM}(${result.durationMs}ms)${RESET}`;
  let line = `  [${tag}] ${result.name} ${timing}`;
  if (!result.passed && result.detail) {
    line += ` - ${RED}${result.detail}${RESET}`;
  }
  console.log(line);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`${BOLD}Wayfinder Router Smoke Test${RESET}`);
  console.log(`Target: ${options.baseUrl}\n`);

  const results: CheckResult[] = [];

  // 1. Health endpoint
  results.push(
    await runCheck("Health endpoint", () => checkHealth(options.baseUrl)),
  );

  // 2. Ready endpoint
  results.push(
    await runCheck("Ready endpoint", () => checkReady(options.baseUrl)),
  );

  // 3. Metrics endpoint
  results.push(
    await runCheck("Metrics endpoint", () =>
      checkMetrics(options.baseUrl),
    ),
  );

  // 4. Info endpoint
  results.push(
    await runCheck("Info endpoint", () => checkInfo(options.baseUrl)),
  );

  // 5. Content verification actually ran.
  //
  // This runs BEFORE the ArNS check on purpose. Both fetch the same ArNS root,
  // and the first one warms the content cache; a cached response is served
  // without re-listing its verifier gateways, so running this second would
  // silently skip the "x-wayfinder-verified-by" assertion.
  if (!options.skipArns) {
    results.push(
      await runCheck("Content verification", () =>
        checkVerification(options.baseUrl, options.baseDomain, options.arnsName),
      ),
    );

    // 6. ArNS subdomain resolution
    results.push(
      await runCheck(`ArNS subdomain (${options.arnsName})`, () =>
        checkArns(options.baseUrl, options.baseDomain, options.arnsName),
      ),
    );

    // 7. Route mode redirects instead of proxying
    results.push(
      await runCheck("Route mode redirect", () =>
        checkRouteMode(options.baseUrl, options.baseDomain, options.arnsName),
      ),
    );

    // 8. Manifest subpath resolution
    results.push(
      await runCheck("Manifest subpath", () =>
        checkManifestSubpath(
          options.baseUrl,
          options.baseDomain,
          options.arnsName,
        ),
      ),
    );
  }

  // 9. Transaction fetch through the sandbox redirect
  if (options.txId) {
    results.push(
      await runCheck("Transaction fetch (proxy)", () =>
        checkTxFetch(options.baseUrl, options.baseDomain, options.txId!),
      ),
    );
  }

  // 10. Arweave HTTP API proxy (opt-in: requires ARWEAVE_API_ENABLED)
  if (options.checkArweaveApi) {
    results.push(
      await runCheck("Arweave API /info", () =>
        checkArweaveApi(options.baseUrl, options.baseDomain),
      ),
    );
  }

  // 11. GraphQL proxy (opt-in: requires GRAPHQL_PROXY_URL)
  if (options.checkGraphql) {
    results.push(
      await runCheck("GraphQL proxy", () => checkGraphql(options.baseUrl)),
    );
  }

  // 12. Admin API
  results.push(
    await runCheck("Admin API status", () =>
      checkAdmin(options.adminUrl, options.adminToken),
    ),
  );

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(
    `\nResults: ${passed === total ? GREEN : RED}${passed}/${total} passed${RESET}`,
  );

  process.exit(passed === total ? 0 : 1);
}

main();
