import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Verifier } from "./verifier.js";
import { VerificationError } from "../middleware/error-handler.js";
import {
  TEST_TX_ID,
  TEST_GATEWAY_A,
  createTestLogger,
  createMockVerificationStrategy,
  createMockGatewaysProvider,
} from "../test-helpers.js";

function createVerifier(
  overrides: {
    strategy?: ReturnType<typeof createMockVerificationStrategy> | null;
    provider?: ReturnType<typeof createMockGatewaysProvider> | null;
    streamTimeoutMs?: number;
  } = {},
) {
  const strategy =
    overrides.strategy === undefined
      ? createMockVerificationStrategy()
      : overrides.strategy;
  const provider =
    overrides.provider === undefined
      ? createMockGatewaysProvider([TEST_GATEWAY_A])
      : overrides.provider;
  const logger = createTestLogger();

  const verifier = new Verifier({
    verificationStrategy: strategy,
    verificationProvider: provider,
    streamTimeoutMs: overrides.streamTimeoutMs ?? 5_000,
    logger,
  });

  return { verifier, strategy, provider, logger };
}

const TEST_DATA = new TextEncoder().encode("hello world");
const TEST_HEADERS = { "content-type": "text/plain" };

function expectedHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("base64url");
}

/** Collect a ReadableStream into a single Uint8Array */
async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Create a ReadableStream from a Uint8Array */
function streamFrom(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

describe("Verifier", () => {
  describe("verify()", () => {
    it("returns { verified: false } when strategy is null (disabled)", async () => {
      const { verifier } = createVerifier({ strategy: null });

      const result = await verifier.verify(TEST_DATA, TEST_TX_ID, TEST_HEADERS);

      expect(result.verified).toBe(false);
      expect(result.txId).toBe(TEST_TX_ID);
      expect(result.durationMs).toBe(0);
      expect(result.error).toBe("Verification disabled");
    });

    it("returns { verified: true } with SHA-256 hash when strategy passes", async () => {
      const { verifier } = createVerifier();

      const result = await verifier.verify(TEST_DATA, TEST_TX_ID, TEST_HEADERS);

      expect(result.verified).toBe(true);
      expect(result.txId).toBe(TEST_TX_ID);
      expect(result.hash).toBe(expectedHash(TEST_DATA));
      expect(result.error).toBeUndefined();
    });

    it("returns { verified: false } with error when strategy rejects", async () => {
      const strategy = createMockVerificationStrategy(false);
      const { verifier } = createVerifier({ strategy });

      const result = await verifier.verify(TEST_DATA, TEST_TX_ID, TEST_HEADERS);

      expect(result.verified).toBe(false);
      expect(result.txId).toBe(TEST_TX_ID);
      expect(result.error).toBe("Verification failed");
    });

    it("measures duration", async () => {
      const strategy = createMockVerificationStrategy(true);
      // Add a small delay so durationMs > 0
      strategy.verifyData.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      const { verifier } = createVerifier({ strategy });

      const result = await verifier.verify(TEST_DATA, TEST_TX_ID, TEST_HEADERS);

      expect(result.verified).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(1);
    });
  });

  describe("enabled getter", () => {
    it("returns false when strategy is null", () => {
      const { verifier } = createVerifier({ strategy: null });
      expect(verifier.enabled).toBe(false);
    });

    it("returns true when strategy is provided", () => {
      const { verifier } = createVerifier();
      expect(verifier.enabled).toBe(true);
    });
  });

  describe("createStreamingVerification()", () => {
    it("passes stream through untouched when disabled", async () => {
      const { verifier } = createVerifier({ strategy: null });
      const source = streamFrom(TEST_DATA);

      const { stream, verificationPromise } =
        verifier.createStreamingVerification(source, TEST_TX_ID, TEST_HEADERS);

      // Verification promise resolves immediately with disabled result
      const result = await verificationPromise;
      expect(result.verified).toBe(false);
      expect(result.error).toBe("Verification disabled");

      // Stream delivers original data untouched
      const collected = await collectStream(stream);
      expect(collected).toEqual(TEST_DATA);
    });

    it("buffers, verifies, then streams verified data when enabled", async () => {
      const { verifier } = createVerifier();
      const source = streamFrom(TEST_DATA);

      const { stream, verificationPromise } =
        verifier.createStreamingVerification(source, TEST_TX_ID, TEST_HEADERS);

      // Read stream first (it drives the verification)
      const collected = await collectStream(stream);
      expect(collected).toEqual(TEST_DATA);

      // Verification promise should resolve with success
      const result = await verificationPromise;
      expect(result.verified).toBe(true);
      expect(result.hash).toBe(expectedHash(TEST_DATA));
      expect(result.txId).toBe(TEST_TX_ID);
    });

    it("errors the stream when verification fails", async () => {
      const strategy = createMockVerificationStrategy(false);
      const { verifier } = createVerifier({ strategy });
      const source = streamFrom(TEST_DATA);

      const { stream, verificationPromise } =
        verifier.createStreamingVerification(source, TEST_TX_ID, TEST_HEADERS);

      // Reading the stream should throw a VerificationError
      await expect(collectStream(stream)).rejects.toThrow(VerificationError);

      // Verification promise should reject
      await expect(verificationPromise).rejects.toThrow(VerificationError);
    });
  });
});
