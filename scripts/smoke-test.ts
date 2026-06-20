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

  // Extract base domain from base URL if not explicitly set
  if (!options.baseDomain) {
    try {
      const url = new URL(options.baseUrl);
      options.baseDomain = url.hostname;
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
  --skip-arns           Skip ArNS subdomain test
  --base-domain DOMAIN  Base domain for ArNS test (default: extracted from base-url)
  --help, -h            Show this help message

Examples:
  bun scripts/smoke-test.ts
  bun scripts/smoke-test.ts http://my-router.example.com:3000
  bun scripts/smoke-test.ts --skip-arns
  bun scripts/smoke-test.ts --admin-url http://localhost:3001 --admin-token secret123
  bun scripts/smoke-test.ts http://localhost:3000 --base-domain localhost --skip-arns
`);
}

const TIMEOUT_MS = 10_000;

async function runCheck(
  name: string,
  fn: () => Promise<void>,
): Promise<CheckResult> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    return { name, passed: true, durationMs };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    const detail =
      err instanceof Error ? err.message : String(err);
    return { name, passed: false, durationMs, detail };
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

async function checkTxFetch(baseUrl: string): Promise<void> {
  const txId = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";
  const res = await fetch(`${baseUrl}/${txId}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
  });
  if (res.status < 200 || res.status >= 500) {
    throw new Error(`Expected status 2xx/3xx/4xx, got ${res.status}`);
  }
  const modeHeader = res.headers.get("x-wayfinder-mode");
  if (!modeHeader) {
    throw new Error('Response missing "x-wayfinder-mode" header');
  }
}

async function checkArns(
  baseUrl: string,
  baseDomain: string,
): Promise<void> {
  const url = new URL(baseUrl);
  const host = `ardrive.${baseDomain}`;
  const targetUrl = `${url.protocol}//${host}:${url.port || (url.protocol === "https:" ? "443" : "80")}/`;

  const res = await fetch(targetUrl, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
    headers: { Host: host },
  });
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`Expected 2xx or 3xx, got ${res.status}`);
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

  // 5. Transaction fetch
  results.push(
    await runCheck("Transaction fetch", () =>
      checkTxFetch(options.baseUrl),
    ),
  );

  // 6. ArNS subdomain (unless skipped)
  if (!options.skipArns) {
    results.push(
      await runCheck("ArNS subdomain (ardrive)", () =>
        checkArns(options.baseUrl, options.baseDomain),
      ),
    );
  }

  // 7. Admin API
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
