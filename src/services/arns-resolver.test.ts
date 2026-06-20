import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ArnsResolver } from "./arns-resolver.js";
import {
  ArnsResolutionError,
  ArnsConsensusMismatchError,
} from "../middleware/error-handler.js";
import {
  TEST_GATEWAYS,
  TEST_TX_ID,
  TEST_TX_ID_2,
  createTestLogger,
  createMockGatewaysProvider,
} from "../test-helpers.js";

// --- Helpers ---

function createResolver(
  overrides: {
    provider?: ReturnType<typeof createMockGatewaysProvider>;
    fallbackGateways?: URL[];
    consensusThreshold?: number;
    cacheTtlMs?: number;
  } = {},
) {
  const provider =
    overrides.provider ?? createMockGatewaysProvider(TEST_GATEWAYS);
  const logger = createTestLogger();

  const resolver = new ArnsResolver({
    gatewaysProvider: provider,
    fallbackGateways: overrides.fallbackGateways ?? [],
    consensusThreshold: overrides.consensusThreshold ?? 2,
    cacheTtlMs: overrides.cacheTtlMs ?? 300_000,
    logger,
  });

  return { resolver, provider, logger };
}

/**
 * Build a mock Response with ArNS headers for fetch to return.
 */
function arnsResponse(
  txId: string,
  ttlSeconds: number = 300,
  processId?: string,
): Response {
  const headers = new Headers({
    "x-arns-resolved-id": txId,
    "x-arns-ttl-seconds": String(ttlSeconds),
  });
  if (processId) {
    headers.set("x-arns-process-id", processId);
  }
  return new Response(null, { status: 200, headers });
}

/**
 * Build a mock Response that is missing ArNS headers (gateway error scenario).
 */
function emptyResponse(): Response {
  return new Response(null, { status: 200, headers: new Headers() });
}

describe("ArnsResolver", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("successful resolution", () => {
    it("returns resolution when all gateways agree on txId", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID, 600, "process-1"));

      const { resolver } = createResolver();
      const result = await resolver.resolve("my-app");

      expect(result.txId).toBe(TEST_TX_ID);
      expect(result.ttlMs).toBe(600_000); // 600s * 1000
      expect(result.processId).toBe("process-1");
      expect(result.resolvedAt).toBeGreaterThan(0);

      // Should have queried all 3 gateways (HEAD request)
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      for (const call of fetchSpy.mock.calls) {
        expect(call[1]).toMatchObject({ method: "HEAD" });
      }
    });

    it("constructs ArNS subdomain URLs correctly", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();
      await resolver.resolve("my-app");

      const calledUrls = fetchSpy.mock.calls.map((c: any[]) => c[0] as string);
      expect(calledUrls).toContain("https://my-app.gw-a.example.com/");
      expect(calledUrls).toContain("https://my-app.gw-b.example.com/");
      expect(calledUrls).toContain("https://my-app.gw-c.example.com/");
    });

    it("normalizes ArNS name to lowercase", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();
      await resolver.resolve("MyApp");

      const calledUrls = fetchSpy.mock.calls.map((c: any[]) => c[0] as string);
      // All URLs should use lowercase arns name
      for (const url of calledUrls) {
        expect(url).toMatch(/^https:\/\/myapp\./);
      }
    });
  });

  describe("cache behavior", () => {
    it("returns cached result without querying gateways on second call", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      // First call: queries gateways
      const result1 = await resolver.resolve("cached-app");
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockClear();

      // Second call: should hit cache
      const result2 = await resolver.resolve("cached-app");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result2.txId).toBe(result1.txId);
    });

    it("cache is case-insensitive", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      await resolver.resolve("MyApp");
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockClear();

      // Different case should still hit cache
      const result = await resolver.resolve("myapp");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.txId).toBe(TEST_TX_ID);
    });
  });

  describe("consensus mismatch", () => {
    it("throws ArnsConsensusMismatchError when gateways disagree on txId", async () => {
      // Gateway A returns TX_ID, B returns TX_ID_2, C returns TX_ID
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID_2))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      await expect(resolver.resolve("bad-app")).rejects.toThrow(
        ArnsConsensusMismatchError,
      );
    });

    it("includes the conflicting txIds in the error", async () => {
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID_2))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      try {
        await resolver.resolve("mismatch-app");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ArnsConsensusMismatchError);
        const e = error as ArnsConsensusMismatchError;
        expect(e.resolvedTxIds).toContain(TEST_TX_ID);
        expect(e.resolvedTxIds).toContain(TEST_TX_ID_2);
        expect(e.arnsName).toBe("mismatch-app");
      }
    });
  });

  describe("below threshold", () => {
    it("throws ArnsResolutionError when fewer gateways respond than required", async () => {
      // All 3 gateways fail
      fetchSpy.mockRejectedValue(new Error("network error"));

      const { resolver } = createResolver({ consensusThreshold: 2 });

      await expect(resolver.resolve("failing-app")).rejects.toThrow(
        ArnsResolutionError,
      );
    });

    it("throws when only 1 gateway responds but threshold is 2", async () => {
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"));

      const { resolver } = createResolver({ consensusThreshold: 2 });

      await expect(resolver.resolve("partial-app")).rejects.toThrow(
        ArnsResolutionError,
      );
    });

    it("error message includes counts", async () => {
      fetchSpy.mockRejectedValue(new Error("timeout"));

      const { resolver } = createResolver({ consensusThreshold: 2 });

      try {
        await resolver.resolve("fail-app");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ArnsResolutionError);
        const e = error as ArnsResolutionError;
        expect(e.message).toMatch(/0.*of.*2/);
      }
    });
  });

  describe("gateway errors", () => {
    it("treats gateway errors as non-responses, not mismatches", async () => {
      // 2 gateways agree, 1 fails - should succeed (threshold=2)
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockRejectedValueOnce(new Error("gateway down"))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver({ consensusThreshold: 2 });
      const result = await resolver.resolve("partial-ok");

      expect(result.txId).toBe(TEST_TX_ID);
    });

    it("treats non-OK HTTP status as error (non-response)", async () => {
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockResolvedValueOnce(
          new Response(null, { status: 500, headers: new Headers() }),
        )
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver({ consensusThreshold: 2 });
      const result = await resolver.resolve("http-error-app");

      expect(result.txId).toBe(TEST_TX_ID);
    });

    it("treats missing x-arns-resolved-id header as error", async () => {
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID))
        .mockResolvedValueOnce(emptyResponse())
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver({ consensusThreshold: 2 });
      const result = await resolver.resolve("missing-header-app");

      expect(result.txId).toBe(TEST_TX_ID);
    });
  });

  describe("minimum TTL", () => {
    it("uses minimum TTL across all responding gateways", async () => {
      fetchSpy
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID, 600))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID, 120))
        .mockResolvedValueOnce(arnsResponse(TEST_TX_ID, 300));

      const { resolver } = createResolver();
      const result = await resolver.resolve("ttl-app");

      expect(result.ttlMs).toBe(120_000); // min(600, 120, 300) * 1000
    });

    it("defaults to 300 seconds when no TTL headers present", async () => {
      // Responses with no ttl header
      const noTtlResponse = () =>
        new Response(null, {
          status: 200,
          headers: new Headers({
            "x-arns-resolved-id": TEST_TX_ID,
          }),
        });

      fetchSpy
        .mockResolvedValueOnce(noTtlResponse())
        .mockResolvedValueOnce(noTtlResponse())
        .mockResolvedValueOnce(noTtlResponse());

      const { resolver } = createResolver();
      const result = await resolver.resolve("no-ttl-app");

      expect(result.ttlMs).toBe(300_000); // default 300s * 1000
    });
  });

  describe("invalidate", () => {
    it("removes cache entry so next call queries gateways again", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      // Populate cache
      await resolver.resolve("invalidate-app");
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockClear();

      // Invalidate
      resolver.invalidate("invalidate-app");

      // Next call should query gateways again
      await resolver.resolve("invalidate-app");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("clearCache", () => {
    it("removes all entries so subsequent calls query gateways", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      // Populate cache with multiple names
      await resolver.resolve("app-one");
      await resolver.resolve("app-two");
      expect(fetchSpy).toHaveBeenCalledTimes(6); // 3 gateways * 2 names

      fetchSpy.mockClear();

      // Clear all
      resolver.clearCache();

      // Both should trigger fresh queries
      await resolver.resolve("app-one");
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockClear();

      await resolver.resolve("app-two");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("request deduplication", () => {
    it("concurrent calls for same name share the same fetch", async () => {
      // Use a deferred promise so we can control when fetch resolves
      let resolveFetch!: (value: Response) => void;
      const deferredFetch = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      fetchSpy.mockReturnValue(deferredFetch);

      const { resolver } = createResolver();

      // Fire 3 concurrent resolves for the same name
      const p1 = resolver.resolve("dedup-app");
      const p2 = resolver.resolve("dedup-app");
      const p3 = resolver.resolve("dedup-app");

      // Resolve the deferred fetch
      resolveFetch(arnsResponse(TEST_TX_ID));

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // All should get the same result
      expect(r1.txId).toBe(TEST_TX_ID);
      expect(r2.txId).toBe(TEST_TX_ID);
      expect(r3.txId).toBe(TEST_TX_ID);

      // fetch should only have been called once per gateway (3 total), not 9
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("different names are resolved independently", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      await Promise.all([
        resolver.resolve("app-alpha"),
        resolver.resolve("app-beta"),
      ]);

      // 3 gateways * 2 names = 6 fetch calls
      expect(fetchSpy).toHaveBeenCalledTimes(6);
    });
  });

  describe("fallback gateways", () => {
    it("uses fallback gateways when provider returns empty", async () => {
      const emptyProvider = createMockGatewaysProvider([]);
      const fallbackGw = new URL("https://fallback.example.com");

      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver({
        provider: emptyProvider,
        fallbackGateways: [fallbackGw],
        consensusThreshold: 1,
      });

      const result = await resolver.resolve("fallback-app");

      expect(result.txId).toBe(TEST_TX_ID);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("fallback.example.com");
    });

    it("uses fallback gateways when provider throws", async () => {
      const failingProvider = {
        getGateways: vi.fn().mockRejectedValue(new Error("provider error")),
      };
      const fallbackGw = new URL("https://fallback.example.com");

      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver({
        provider: failingProvider,
        fallbackGateways: [fallbackGw],
        consensusThreshold: 1,
      });

      const result = await resolver.resolve("provider-fail-app");

      expect(result.txId).toBe(TEST_TX_ID);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("fallback.example.com");
    });
  });

  describe("stats", () => {
    it("reports cache size", async () => {
      fetchSpy.mockResolvedValue(arnsResponse(TEST_TX_ID));

      const { resolver } = createResolver();

      expect(resolver.stats().size).toBe(0);

      await resolver.resolve("stats-app");
      expect(resolver.stats().size).toBe(1);

      await resolver.resolve("stats-app-2");
      expect(resolver.stats().size).toBe(2);
    });
  });
});
