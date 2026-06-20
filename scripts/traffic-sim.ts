#!/usr/bin/env bun
/**
 * Traffic Simulation
 *
 * Generates realistic traffic against a running wayfinder-router instance.
 * Zero external dependencies — uses only native fetch and Bun/Node APIs.
 *
 * Usage:
 *   bun scripts/traffic-sim.ts [base-url] [options]
 *
 * Options:
 *   --duration SECONDS     Duration of the simulation (default: 60)
 *   --concurrency N        Max concurrent requests (default: 10)
 *   --rps N                Target requests per second, 0=unlimited (default: 50)
 *   --base-domain DOMAIN   Base domain for ArNS subdomains (default: extracted from base-url)
 *   --help                 Show this help message
 *
 * Examples:
 *   bun scripts/traffic-sim.ts
 *   bun scripts/traffic-sim.ts http://localhost:3000 --duration 30 --rps 100
 *   bun scripts/traffic-sim.ts http://my-router.local:3000 --base-domain my-router.local
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Options {
  baseUrl: string;
  duration: number;
  concurrency: number;
  rps: number;
  baseDomain: string;
  port: number;
  protocol: string;
  help: boolean;
}

type RequestType = "arns" | "txid" | "manifest";

interface RequestResult {
  type: RequestType;
  status: number;
  latencyMs: number;
  success: boolean;
  timeout: boolean;
  error: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARNS_NAMES = ["ardrive", "arns", "cookbook", "ar-wiki", "alex", "permaweb"];

const TX_IDS = [
  "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
  "bNbA3TEQVL60xlgCcqdz4ZPHFZ711cZ3hmkpGttDt_U",
  "lyc8sSKAFt4TJM6fDxR-MOGZb0Lmj60I_4OwYLnrLAw",
  "UyC5P5qKPZaltMmmZAWdakhlDXQA6NR8-jPlNGnVFY4",
  "6Jfg0nXB-x4Hj1rQ_UjsKL0M0DX_pCcBVdPMvODVyqU",
];

const MANIFEST_SUBPATHS = [
  "index.html",
  "style.css",
  "app.js",
  "assets/logo.png",
  "favicon.ico",
];

const REQUEST_TIMEOUT_MS = 30_000;
const PROGRESS_INTERVAL_MS = 5_000;

// Traffic mix ratios
const ARNS_RATIO = 0.6;
const TXID_RATIO = 0.2;
// MANIFEST_RATIO = 0.2 (remainder)

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    baseUrl: "http://localhost:3000",
    duration: 60,
    concurrency: 10,
    rps: 50,
    baseDomain: "",
    port: 3000,
    protocol: "http:",
    help: false,
  };

  // First positional arg is base-url if it looks like a URL
  let argStart = 0;
  if (args.length > 0 && !args[0].startsWith("--") && !args[0].startsWith("-")) {
    options.baseUrl = args[0];
    argStart = 1;
  }

  for (let i = argStart; i < args.length; i++) {
    switch (args[i]) {
      case "--duration":
        options.duration = parseInt(args[++i], 10);
        break;
      case "--concurrency":
        options.concurrency = parseInt(args[++i], 10);
        break;
      case "--rps":
        options.rps = parseInt(args[++i], 10);
        break;
      case "--base-domain":
        options.baseDomain = args[++i];
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  // Extract domain and port from base URL
  const url = new URL(options.baseUrl);
  options.protocol = url.protocol;
  options.port = url.port ? parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80);
  if (!options.baseDomain) {
    options.baseDomain = url.hostname;
  }

  return options;
}

function showHelp(): void {
  console.log(`
Traffic Simulation for Wayfinder Router

Generates realistic traffic against a running wayfinder-router instance.

Usage:
  bun scripts/traffic-sim.ts [base-url] [options]

Arguments:
  base-url                Target URL (default: http://localhost:3000)

Options:
  --duration SECONDS      Duration of the simulation (default: 60)
  --concurrency N         Max concurrent requests (default: 10)
  --rps N                 Target requests per second, 0=unlimited (default: 50)
  --base-domain DOMAIN    Base domain for ArNS subdomains (default: extracted from base-url)
  --help, -h              Show this help message

Examples:
  bun scripts/traffic-sim.ts
  bun scripts/traffic-sim.ts http://localhost:3000 --duration 30 --rps 100
  bun scripts/traffic-sim.ts http://my-router.local:3000 --base-domain my-router.local
`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// Token bucket rate limiter
// ---------------------------------------------------------------------------

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(rps: number) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.refillRate = rps / 1000;
    this.lastRefill = performance.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait for enough time to get at least 1 token
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
      await sleep(Math.max(1, waitMs));
    }
  }

  private refill(): void {
    const now = performance.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

function buildUrl(type: RequestType, options: Options): string {
  const { protocol, baseDomain, port } = options;

  // Determine if we need an explicit port in the URL
  const needsPort =
    (protocol === "http:" && port !== 80) ||
    (protocol === "https:" && port !== 443);
  const portSuffix = needsPort ? `:${port}` : "";

  switch (type) {
    case "arns": {
      const name = randomItem(ARNS_NAMES);
      return `${protocol}//${name}.${baseDomain}${portSuffix}/`;
    }
    case "txid": {
      const txId = randomItem(TX_IDS);
      return `${protocol}//${baseDomain}${portSuffix}/${txId}`;
    }
    case "manifest": {
      const txId = randomItem(TX_IDS);
      const subpath = randomItem(MANIFEST_SUBPATHS);
      return `${protocol}//${baseDomain}${portSuffix}/${txId}/${subpath}`;
    }
  }
}

function pickRequestType(): RequestType {
  const r = Math.random();
  if (r < ARNS_RATIO) return "arns";
  if (r < ARNS_RATIO + TXID_RATIO) return "txid";
  return "manifest";
}

// ---------------------------------------------------------------------------
// Request execution
// ---------------------------------------------------------------------------

async function sendRequest(options: Options): Promise<RequestResult> {
  const type = pickRequestType();
  const url = buildUrl(type, options);
  const start = performance.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    // Consume the body to ensure the connection is fully completed
    await response.arrayBuffer();

    const latencyMs = performance.now() - start;
    const status = response.status;
    const success = status >= 200 && status < 400;

    return { type, status, latencyMs, success, timeout: false, error: false };
  } catch (err: any) {
    const latencyMs = performance.now() - start;
    const isTimeout =
      err?.name === "TimeoutError" ||
      err?.name === "AbortError" ||
      err?.message?.includes("timeout");

    return {
      type,
      status: 0,
      latencyMs,
      success: false,
      timeout: isTimeout,
      error: !isTimeout,
    };
  }
}

// ---------------------------------------------------------------------------
// Progress & reporting
// ---------------------------------------------------------------------------

function printProgress(
  elapsedSec: number,
  results: RequestResult[],
): void {
  const total = results.length;
  if (total === 0) return;

  const rps = total / elapsedSec;
  const successCount = results.filter((r) => r.success).length;
  const successRate = pct(successCount, total);

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = formatMs(percentile(latencies, 50));
  const p95 = formatMs(percentile(latencies, 95));

  console.log(
    `[${Math.round(elapsedSec)}s] ${total} reqs | ${rps.toFixed(1)} rps | p50=${p50} p95=${p95} | ${successRate}% success`,
  );
}

function printReport(results: RequestResult[], wallTimeSec: number): void {
  const total = results.length;
  if (total === 0) {
    console.log("\n--- Traffic Simulation Report ---");
    console.log("No requests completed.");
    return;
  }

  const successCount = results.filter((r) => r.success).length;
  const clientErrCount = results.filter(
    (r) => !r.success && !r.timeout && !r.error && r.status >= 400 && r.status < 500,
  ).length;
  const serverErrCount = results.filter(
    (r) => !r.success && !r.timeout && !r.error && r.status >= 500,
  ).length;
  const timeoutCount = results.filter((r) => r.timeout).length;
  const networkErrCount = results.filter((r) => r.error).length;
  const otherErrCount =
    total - successCount - clientErrCount - serverErrCount - timeoutCount - networkErrCount;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = formatMs(percentile(latencies, 50));
  const p95 = formatMs(percentile(latencies, 95));
  const p99 = formatMs(percentile(latencies, 99));

  console.log("\n--- Traffic Simulation Report ---");
  console.log(`Duration:    ${wallTimeSec.toFixed(1)}s`);
  console.log(`Total:       ${total} requests`);
  console.log(`Success:     ${successCount} (${pct(successCount, total)}%)`);
  console.log(`Client err:  ${clientErrCount} (${pct(clientErrCount, total)}%)`);
  console.log(`Server err:  ${serverErrCount} (${pct(serverErrCount, total)}%)`);
  console.log(`Timeouts:    ${timeoutCount} (${pct(timeoutCount, total)}%)`);
  if (networkErrCount > 0) {
    console.log(`Network err: ${networkErrCount} (${pct(networkErrCount, total)}%)`);
  }
  if (otherErrCount > 0) {
    console.log(`Other err:   ${otherErrCount} (${pct(otherErrCount, total)}%)`);
  }

  console.log(`\nLatency:     p50=${p50}  p95=${p95}  p99=${p99}`);

  // Per-type breakdown
  console.log("\nBy type:");
  for (const type of ["arns", "txid", "manifest"] as RequestType[]) {
    const typeResults = results.filter((r) => r.type === type);
    if (typeResults.length === 0) continue;
    const typeLatencies = typeResults.map((r) => r.latencyMs).sort((a, b) => a - b);
    const typeP50 = formatMs(percentile(typeLatencies, 50));
    const typeSuccess = pct(
      typeResults.filter((r) => r.success).length,
      typeResults.length,
    );
    const label = type === "arns" ? "ArNS" : type === "txid" ? "TxId" : "Manifest";
    console.log(
      `  ${label.padEnd(10)} ${String(typeResults.length).padStart(5)} reqs  p50=${typeP50.padEnd(8)} ${typeSuccess}% ok`,
    );
  }

  const throughput = total / wallTimeSec;
  console.log(`\nThroughput:  ${throughput.toFixed(1)} req/s avg`);
}

// ---------------------------------------------------------------------------
// Main simulation loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate options
  if (isNaN(options.duration) || options.duration <= 0) {
    console.error("Error: --duration must be a positive number");
    process.exit(1);
  }
  if (isNaN(options.concurrency) || options.concurrency <= 0) {
    console.error("Error: --concurrency must be a positive number");
    process.exit(1);
  }
  if (isNaN(options.rps) || options.rps < 0) {
    console.error("Error: --rps must be a non-negative number");
    process.exit(1);
  }

  console.log("Wayfinder Router - Traffic Simulation\n");
  console.log(`Target:      ${options.baseUrl}`);
  console.log(`Base domain: ${options.baseDomain}`);
  console.log(`Duration:    ${options.duration}s`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Target RPS:  ${options.rps === 0 ? "unlimited" : options.rps}`);
  console.log("");

  const results: RequestResult[] = [];
  const startTime = performance.now();
  const durationMs = options.duration * 1000;
  let stopping = false;

  // Graceful shutdown on SIGINT
  const onSigint = () => {
    if (stopping) return;
    stopping = true;
    console.log("\n\nInterrupted — stopping and printing partial report...");
  };
  process.on("SIGINT", onSigint);

  // Rate limiter (if rps > 0)
  const rateLimiter = options.rps > 0 ? new TokenBucket(options.rps) : null;

  // Progress ticker
  const progressTimer = setInterval(() => {
    const elapsedSec = (performance.now() - startTime) / 1000;
    printProgress(elapsedSec, results);
  }, PROGRESS_INTERVAL_MS);

  // Worker function: keep sending requests until done
  async function worker(): Promise<void> {
    while (!stopping) {
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) break;

      // Rate limiting
      if (rateLimiter) {
        await rateLimiter.acquire();
        // Re-check after waiting for token
        if (stopping || performance.now() - startTime >= durationMs) break;
      }

      const result = await sendRequest(options);
      if (!stopping) {
        results.push(result);
      }
    }
  }

  // Launch workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < options.concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  stopping = true;
  clearInterval(progressTimer);

  const wallTimeSec = (performance.now() - startTime) / 1000;
  printReport(results, wallTimeSec);

  process.off("SIGINT", onSigint);

  // Exit with error if success rate is below 50%
  const successRate = results.length > 0
    ? results.filter((r) => r.success).length / results.length
    : 0;
  process.exit(successRate < 0.5 ? 1 : 0);
}

main();
