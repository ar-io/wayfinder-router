#!/usr/bin/env bun
/**
 * Reward Calculator CLI
 *
 * Commands:
 *   calculate [--date YYYY-MM-DD] [--config path]  Calculate rewards for a period
 *   preview <periodId>                              Preview distribution for a period
 *   approve <periodId>                              Approve a period for distribution
 *   reject <periodId> --reason "..."                Reject a period
 *   distribute <periodId> [--dry-run]               Execute distribution
 *   list [--status STATUS]                          List all periods
 *   publish <periodId>                              Publish period to Arweave
 *   fraud-check <periodId>                          Run fraud detection
 */

import { Database } from "bun:sqlite";

import {
  createRewardCalculator,
  type TelemetrySource,
  type GatewayRegistry,
} from "./calculator.js";
import {
  createRewardDistributor,
  type TokenTransferService,
  type DelegationSource,
} from "./distributor.js";
import { createFileStorage } from "./storage.js";
import { DEFAULT_REWARD_CONFIG, type GatewayStats } from "./types.js";
import { readFile } from "fs/promises";
import { resolve } from "path";

// Configuration
const DATA_DIR = process.env.REWARDS_DATA_DIR || "./data/rewards";
const TELEMETRY_DB_PATH =
  process.env.TELEMETRY_DB_PATH || "./data/telemetry.db";
const INSTANCE_ID = process.env.INSTANCE_ID || "wayfinder-main";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case "calculate":
        await runCalculate(args.slice(1));
        break;
      case "preview":
        await runPreview(args.slice(1));
        break;
      case "approve":
        await runApprove(args.slice(1));
        break;
      case "reject":
        await runReject(args.slice(1));
        break;
      case "distribute":
        await runDistribute(args.slice(1));
        break;
      case "list":
        await runList(args.slice(1));
        break;
      case "fraud-check":
        await runFraudCheck(args.slice(1));
        break;
      case "help":
        printUsage();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Wayfinder Gateway Rewards CLI

Usage: npm run rewards <command> [options]

Commands:
  calculate [--date YYYY-MM-DD] [--config path]
    Calculate rewards for a specific date (defaults to yesterday)

  preview <periodId>
    Preview how rewards would be distributed for a period

  approve <periodId>
    Mark a period as approved for distribution

  reject <periodId> --reason "reason text"
    Mark a period as rejected

  distribute <periodId> [--dry-run]
    Execute token distribution for an approved period

  list [--status calculated|pending_review|approved|distributed|rejected]
    List all reward periods

  fraud-check <periodId>
    Run fraud detection on a period

Environment Variables:
  REWARDS_DATA_DIR    Directory for reward data (default: ./data/rewards)
  TELEMETRY_DB_PATH   Path to telemetry database (default: ./data/telemetry.db)
  INSTANCE_ID         Identifier for this Wayfinder instance

Examples:
  npm run rewards calculate
  npm run rewards calculate --date 2026-01-25
  npm run rewards preview 2026-01-25_2026-01-26
  npm run rewards approve 2026-01-25_2026-01-26
  npm run rewards distribute 2026-01-25_2026-01-26 --dry-run
`);
}

async function runCalculate(args: string[]) {
  // Parse arguments
  let targetDate: Date | undefined;
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      targetDate = new Date(args[i + 1]);
      i++;
    } else if (args[i] === "--config" && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    }
  }

  // Load custom config if provided
  let config = DEFAULT_REWARD_CONFIG;
  if (configPath) {
    const configContent = await readFile(resolve(configPath), "utf-8");
    config = { ...config, ...JSON.parse(configContent) };
  }

  // Create dependencies
  const storage = createFileStorage({ dataDir: DATA_DIR });
  const telemetry = await createTelemetrySource();
  const gatewayRegistry = createMockGatewayRegistry(); // TODO: Implement real registry

  const calculator = createRewardCalculator({
    telemetry,
    gatewayRegistry,
    instanceId: INSTANCE_ID,
  });

  // Calculate
  let period;
  if (targetDate) {
    const startTime = new Date(targetDate);
    startTime.setUTCHours(0, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
    period = await calculator.calculateRewards(startTime, endTime, config);
  } else {
    period = await calculator.calculateYesterdayRewards(config);
  }

  // Mark as pending review
  period.status = "pending_review";

  // Save
  await storage.savePeriod(period);

  // Output
  console.log(calculator.formatForPublishing(period));
  console.log(`\nPeriod saved: ${period.periodId}`);
  console.log(`Status: ${period.status}`);
  console.log(`Next steps:`);
  console.log(`  1. Review the calculations above`);
  console.log(
    `  2. Run fraud check: npm run rewards fraud-check ${period.periodId}`,
  );
  console.log(`  3. Approve: npm run rewards approve ${period.periodId}`);
  console.log(`  4. Distribute: npm run rewards distribute ${period.periodId}`);
}

async function runPreview(args: string[]) {
  const periodId = args[0];
  if (!periodId) {
    throw new Error("Period ID required");
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });
  const distributor = createRewardDistributor({
    tokenService: createMockTokenService(),
    delegationSource: createMockDelegationSource(),
    storage,
  });

  const period = await storage.loadPeriod(periodId);
  if (!period) {
    throw new Error(`Period ${periodId} not found`);
  }

  const distributions = await distributor.previewDistribution(period);
  console.log(distributor.formatDistributionPreview(distributions));
}

async function runApprove(args: string[]) {
  const periodId = args[0];
  if (!periodId) {
    throw new Error("Period ID required");
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });
  const distributor = createRewardDistributor({
    tokenService: createMockTokenService(),
    delegationSource: createMockDelegationSource(),
    storage,
  });

  await distributor.approvePeriod(periodId);
  console.log(`Period ${periodId} approved for distribution`);
}

async function runReject(args: string[]) {
  const periodId = args[0];
  let reason = "";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--reason" && args[i + 1]) {
      reason = args[i + 1];
      break;
    }
  }

  if (!periodId) {
    throw new Error("Period ID required");
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });
  const distributor = createRewardDistributor({
    tokenService: createMockTokenService(),
    delegationSource: createMockDelegationSource(),
    storage,
  });

  await distributor.rejectPeriod(periodId, reason);
  console.log(`Period ${periodId} rejected`);
}

async function runDistribute(args: string[]) {
  const periodId = args[0];
  const dryRun = args.includes("--dry-run");

  if (!periodId) {
    throw new Error("Period ID required");
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });

  // For real distribution, you'd use actual token service
  // const tokenService = await createRealTokenService();
  const tokenService = createMockTokenService();

  const distributor = createRewardDistributor({
    tokenService,
    delegationSource: createMockDelegationSource(),
    storage,
  });

  if (dryRun) {
    console.log("=== DRY RUN MODE ===\n");
  }

  const result = await distributor.executeDistribution(periodId, dryRun);

  console.log(`\nDistribution ${result.success ? "completed" : "had errors"}:`);
  console.log(
    `  Total distributed: ${result.totalDistributed.toFixed(3)} ARIO`,
  );
  console.log(`  Transactions: ${result.transactions.length}`);

  if (!result.success) {
    console.log("\nErrors:");
    for (const tx of result.transactions.filter((t) => t.error)) {
      console.log(`  ${tx.address}: ${tx.error}`);
    }
  }

  if (!dryRun) {
    console.log("\nTransaction IDs:");
    for (const tx of result.transactions.filter((t) => t.txId)) {
      console.log(`  ${tx.address}: ${tx.txId}`);
    }
  }
}

async function runList(args: string[]) {
  let status: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--status" && args[i + 1]) {
      status = args[i + 1];
      i++;
    }
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });
  const periods = await storage.listPeriods(status as any);

  if (periods.length === 0) {
    console.log("No reward periods found");
    return;
  }

  console.log("Reward Periods:\n");
  console.log(
    "Period ID                    Status           Qualified   Pool       Distributed",
  );
  console.log("-".repeat(90));

  for (const period of periods) {
    const distributed = period.distribution?.totalDistributed ?? 0;
    console.log(
      `${period.periodId.padEnd(28)} ${period.status.padEnd(16)} ${String(period.networkStats.qualifiedGateways).padEnd(11)} ${period.config.dailyPoolAmount.toFixed(0).padEnd(10)} ${distributed.toFixed(3)}`,
    );
  }
}

async function runFraudCheck(args: string[]) {
  const periodId = args[0];
  if (!periodId) {
    throw new Error("Period ID required");
  }

  const storage = createFileStorage({ dataDir: DATA_DIR });
  const telemetry = await createTelemetrySource();
  const gatewayRegistry = createMockGatewayRegistry();

  const calculator = createRewardCalculator({
    telemetry,
    gatewayRegistry,
    instanceId: INSTANCE_ID,
  });

  const period = await storage.loadPeriod(periodId);
  if (!period) {
    throw new Error(`Period ${periodId} not found`);
  }

  // Get historical periods for comparison
  const historicalPeriods = await storage.getLatestPeriods(7);
  const relevantHistory = historicalPeriods.filter(
    (p) => p.periodId !== periodId,
  );

  const flags = calculator.detectFraudPatterns(period, relevantHistory);

  if (flags.length === 0) {
    console.log(`No fraud patterns detected for period ${periodId}`);
  } else {
    console.log(`\nFraud flags for period ${periodId}:\n`);
    for (const flag of flags) {
      console.log(`Gateway: ${flag.gateway}`);
      console.log(`  Type: ${flag.flagType}`);
      console.log(`  Description: ${flag.description}`);
      console.log(`  Evidence: ${JSON.stringify(flag.evidence, null, 2)}`);
      console.log("");
    }
    console.log(
      `\nReview these flags before approving. If fraud is confirmed, reject the period or adjust rewards.`,
    );
  }
}

// Telemetry source - reads from SQLite database
async function createTelemetrySource(): Promise<TelemetrySource> {
  let db: InstanceType<typeof Database>;

  try {
    db = new Database(TELEMETRY_DB_PATH, { readonly: true });
  } catch {
    console.warn("Could not open telemetry database, using mock data");
    return createMockTelemetrySource();
  }

  return {
    async getGatewayStats(
      startTime: Date,
      endTime: Date,
    ): Promise<GatewayStats[]> {
      const startHour = startTime.toISOString().slice(0, 13) + ":00:00";
      const endHour = endTime.toISOString().slice(0, 13) + ":00:00";

      const rows = db
        .prepare(
          `
        SELECT
          gateway,
          SUM(total_requests) as total_requests,
          SUM(successful_requests) as successful_requests,
          SUM(client_errors + server_errors) as failed_requests,
          AVG(avg_latency_ms) as avg_latency_ms,
          AVG(p95_latency_ms) as p95_latency_ms,
          SUM(total_bytes_served) as total_bytes_served,
          SUM(verification_successes) as verification_successes,
          SUM(verification_failures) as verification_failures
        FROM gateway_hourly_stats
        WHERE hour_bucket >= ? AND hour_bucket < ?
        GROUP BY gateway
      `,
        )
        .all(startHour, endHour);

      return rows.map((row: any) => ({
        gateway: row.gateway,
        fqdn: extractFqdn(row.gateway),
        operatorAddress: "", // Will be enriched later
        totalRequests: row.total_requests || 0,
        successfulRequests: row.successful_requests || 0,
        failedRequests: row.failed_requests || 0,
        avgLatencyMs: row.avg_latency_ms || 0,
        p95LatencyMs: row.p95_latency_ms || 0,
        totalBytesServed: row.total_bytes_served || 0,
        verificationRequests:
          (row.verification_successes || 0) + (row.verification_failures || 0),
        verificationSuccesses: row.verification_successes || 0,
        isVerificationGateway: false, // Will be enriched later
      }));
    },

    async getVerificationGateways(): Promise<string[]> {
      // Get from config or environment
      const envGateways = process.env.VERIFICATION_STATIC_GATEWAYS;
      if (envGateways) {
        return envGateways.split(",").map((g) => g.trim());
      }
      // Default verification gateways
      return ["turbo-gateway.com", "permagate.io", "ardrive.net"];
    },
  };
}

function extractFqdn(gatewayUrl: string): string {
  try {
    const url = new URL(gatewayUrl);
    return url.hostname;
  } catch {
    return gatewayUrl;
  }
}

// Mock implementations for development/testing

function createMockTelemetrySource(): TelemetrySource {
  return {
    async getGatewayStats(): Promise<GatewayStats[]> {
      return [
        {
          gateway: "https://ar-io.dev",
          fqdn: "ar-io.dev",
          operatorAddress: "mock-operator-1",
          totalRequests: 5000,
          successfulRequests: 4900,
          failedRequests: 100,
          avgLatencyMs: 150,
          p95LatencyMs: 300,
          totalBytesServed: 1024 * 1024 * 500,
          verificationRequests: 1000,
          verificationSuccesses: 990,
          isVerificationGateway: true,
        },
        {
          gateway: "https://turbo-gateway.com",
          fqdn: "turbo-gateway.com",
          operatorAddress: "mock-operator-2",
          totalRequests: 3000,
          successfulRequests: 2950,
          failedRequests: 50,
          avgLatencyMs: 200,
          p95LatencyMs: 400,
          totalBytesServed: 1024 * 1024 * 300,
          verificationRequests: 800,
          verificationSuccesses: 795,
          isVerificationGateway: true,
        },
      ];
    },
    async getVerificationGateways(): Promise<string[]> {
      return ["turbo-gateway.com", "permagate.io"];
    },
  };
}

function createMockGatewayRegistry(): GatewayRegistry {
  return {
    async getOperatorAddress(fqdn: string): Promise<string | undefined> {
      return `operator-${fqdn}`;
    },
    async getGatewayInfo(fqdn: string) {
      return {
        operatorAddress: `operator-${fqdn}`,
        fqdn,
      };
    },
  };
}

function createMockTokenService(): TokenTransferService {
  return {
    async transfer(to: string, amount: number) {
      console.log(`[MOCK] Would transfer ${amount} ARIO to ${to}`);
      return { txId: `mock-tx-${Date.now()}-${to.slice(0, 8)}` };
    },
    async getBalance() {
      return 100000; // Mock balance
    },
  };
}

function createMockDelegationSource(): DelegationSource {
  return {
    async getDelegationInfo(operatorAddress: string) {
      // In production, query ar.io network for delegation settings
      return {
        operatorAddress,
        delegateRewardShareRatio: 50, // 50% to delegates
        delegates: [
          {
            address: `delegate-1-${operatorAddress.slice(0, 8)}`,
            stake: 1000,
            shareOfDelegatedStake: 0.6,
          },
          {
            address: `delegate-2-${operatorAddress.slice(0, 8)}`,
            stake: 500,
            shareOfDelegatedStake: 0.4,
          },
        ],
      };
    },
  };
}

// Run CLI
main();
