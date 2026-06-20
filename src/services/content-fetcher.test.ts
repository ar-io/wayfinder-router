import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContentFetcher } from "./content-fetcher.js";
import { GatewayError } from "../middleware/error-handler.js";
import {
  TEST_GATEWAY_A,
  TEST_GATEWAY_B,
  TEST_TX_ID,
  createTestLogger,
} from "../test-helpers.js";

// --- Mock factories ---

function createMockGatewaySelector() {
  return {
    selectForTransaction: vi.fn().mockResolvedValue(TEST_GATEWAY_A),
    selectForArns: vi.fn().mockResolvedValue(TEST_GATEWAY_A),
    markHealthy: vi.fn(),
    recordFailure: vi.fn(),
    recordVerificationFailure: vi.fn(),
    markUnhealthy: vi.fn(),
    select: vi.fn(),
    healthStats: vi.fn(),
    clearHealthCache: vi.fn(),
  };
}

function createMockTemperatureCache() {
  return {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getTemperature: vi.fn(),
    getScores: vi.fn(),
    clear: vi.fn(),
  };
}

function createMockHttpClient() {
  return {
    fetch: vi.fn(),
    close: vi.fn(),
  };
}

function createOkResponse(
  body: string = "content",
  headers: Record<string, string> = {},
): Response {
  const h = new Headers({
    "content-type": "text/html",
    "content-length": String(body.length),
    ...headers,
  });
  return new Response(body, { status: 200, statusText: "OK", headers: h });
}

function createErrorResponse(status: number = 500): Response {
  return new Response("error", {
    status,
    statusText: "Internal Server Error",
  });
}

interface CreateFetcherOptions {
  selector?: ReturnType<typeof createMockGatewaySelector>;
  temperatureCache?: ReturnType<typeof createMockTemperatureCache>;
  httpClient?: ReturnType<typeof createMockHttpClient>;
  retryAttempts?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
}

function createFetcher(overrides: CreateFetcherOptions = {}) {
  const selector = overrides.selector ?? createMockGatewaySelector();
  const logger = createTestLogger();
  const temperatureCache = overrides.temperatureCache;
  const httpClient = overrides.httpClient;

  const fetcher = new ContentFetcher({
    gatewaySelector: selector as any,
    retryAttempts: overrides.retryAttempts ?? 3,
    retryDelayMs: overrides.retryDelayMs ?? 0,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 5000,
    logger,
    temperatureCache: temperatureCache as any,
    httpClient: httpClient as any,
  });

  return { fetcher, selector, logger, temperatureCache, httpClient };
}

describe("ContentFetcher", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createOkResponse());
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe("fetchByTxId", () => {
    it("returns response and gateway on successful fetch, marks gateway healthy", async () => {
      const { fetcher, selector } = createFetcher();

      const result = await fetcher.fetchByTxId({
        txId: TEST_TX_ID,
        path: "/",
      });

      expect(result.response).toBeDefined();
      expect(result.gateway).toBe(TEST_GATEWAY_A);
      expect(result.headers).toBeInstanceOf(Headers);
      expect(selector.markHealthy).toHaveBeenCalledWith(TEST_GATEWAY_A);
      expect(selector.recordFailure).not.toHaveBeenCalled();
    });

    it("records temperature (latency) when temperatureCache is provided", async () => {
      const temperatureCache = createMockTemperatureCache();
      const { fetcher } = createFetcher({ temperatureCache });

      await fetcher.fetchByTxId({ txId: TEST_TX_ID, path: "/" });

      expect(temperatureCache.recordSuccess).toHaveBeenCalledTimes(1);
      const [origin, latency] = temperatureCache.recordSuccess.mock.calls[0];
      expect(origin).toBe(TEST_GATEWAY_A.origin);
      expect(typeof latency).toBe("number");
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it("retries on gateway error (non-200 response), records failure, tries next gateway", async () => {
      const selector = createMockGatewaySelector();
      selector.selectForTransaction
        .mockResolvedValueOnce(TEST_GATEWAY_A)
        .mockResolvedValueOnce(TEST_GATEWAY_B);

      fetchSpy
        .mockResolvedValueOnce(createErrorResponse(503))
        .mockResolvedValueOnce(createOkResponse());

      const { fetcher } = createFetcher({ selector, retryAttempts: 3 });

      const result = await fetcher.fetchByTxId({
        txId: TEST_TX_ID,
        path: "/",
      });

      expect(result.gateway).toBe(TEST_GATEWAY_B);
      expect(selector.recordFailure).toHaveBeenCalledWith(TEST_GATEWAY_A);
      expect(selector.markHealthy).toHaveBeenCalledWith(TEST_GATEWAY_B);
    });

    it("retries on timeout/network error, records failure, tries next gateway", async () => {
      const selector = createMockGatewaySelector();
      selector.selectForTransaction
        .mockResolvedValueOnce(TEST_GATEWAY_A)
        .mockResolvedValueOnce(TEST_GATEWAY_B);

      fetchSpy
        .mockRejectedValueOnce(new Error("fetch failed: network timeout"))
        .mockResolvedValueOnce(createOkResponse());

      const { fetcher } = createFetcher({ selector, retryAttempts: 3 });

      const result = await fetcher.fetchByTxId({
        txId: TEST_TX_ID,
        path: "/",
      });

      expect(result.gateway).toBe(TEST_GATEWAY_B);
      expect(selector.recordFailure).toHaveBeenCalledWith(TEST_GATEWAY_A);
    });

    it("throws GatewayError when all retries are exhausted", async () => {
      const selector = createMockGatewaySelector();
      selector.selectForTransaction.mockResolvedValue(TEST_GATEWAY_A);

      fetchSpy.mockResolvedValue(createErrorResponse(502));

      const { fetcher } = createFetcher({
        selector,
        retryAttempts: 2,
      });

      await expect(
        fetcher.fetchByTxId({ txId: TEST_TX_ID, path: "/" }),
      ).rejects.toThrow(GatewayError);

      expect(selector.recordFailure).toHaveBeenCalledTimes(2);
    });

    it("passes exclude list through to gateway selector", async () => {
      const selector = createMockGatewaySelector();
      const { fetcher } = createFetcher({ selector });

      const excludeList = [TEST_GATEWAY_B];

      await fetcher.fetchByTxId({
        txId: TEST_TX_ID,
        path: "/",
        excludeGateways: excludeList,
      });

      const call = selector.selectForTransaction.mock.calls[0];
      // Args: txId, path, exclude
      expect(call[2]).toEqual(expect.arrayContaining([TEST_GATEWAY_B]));
    });

    it("returns filtered headers from gateway response", async () => {
      fetchSpy.mockResolvedValue(
        createOkResponse("body", {
          "content-type": "application/json",
          "x-ar-io-digest": "abc123",
          "set-cookie": "session=xyz",
        }),
      );

      const { fetcher } = createFetcher();

      const result = await fetcher.fetchByTxId({
        txId: TEST_TX_ID,
        path: "/",
      });

      // Passthrough and x-ar-io-* headers should be present
      expect(result.headers.get("content-type")).toBe("application/json");
      expect(result.headers.get("x-ar-io-digest")).toBe("abc123");
      // Stripped headers should not be present
      expect(result.headers.get("set-cookie")).toBeNull();
    });
  });

  describe("fetchByArns", () => {
    it("constructs correct subdomain URL via selectForArns", async () => {
      const selector = createMockGatewaySelector();
      const { fetcher } = createFetcher({ selector });

      await fetcher.fetchByArns({
        arnsName: "ardrive",
        resolvedTxId: TEST_TX_ID,
        path: "/",
      });

      expect(selector.selectForArns).toHaveBeenCalledWith(
        "ardrive",
        "/",
        undefined,
      );
      expect(selector.selectForTransaction).not.toHaveBeenCalled();

      // Verify fetch was called with a URL containing the arnsName
      const fetchUrl = fetchSpy.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("ardrive");
    });

    it("passes exclude list through to gateway selector for ArNS", async () => {
      const selector = createMockGatewaySelector();
      const { fetcher } = createFetcher({ selector });

      const excludeList = [TEST_GATEWAY_B];

      await fetcher.fetchByArns({
        arnsName: "ardrive",
        resolvedTxId: TEST_TX_ID,
        path: "/",
        excludeGateways: excludeList,
      });

      const call = selector.selectForArns.mock.calls[0];
      expect(call[2]).toEqual(expect.arrayContaining([TEST_GATEWAY_B]));
    });
  });

  describe("httpClient usage", () => {
    it("uses httpClient.fetch when httpClient is provided", async () => {
      const httpClient = createMockHttpClient();
      httpClient.fetch.mockResolvedValue(createOkResponse());

      const { fetcher } = createFetcher({ httpClient });

      await fetcher.fetchByTxId({ txId: TEST_TX_ID, path: "/" });

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      // globalThis.fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("falls back to globalThis.fetch when no httpClient provided", async () => {
      const { fetcher } = createFetcher();

      await fetcher.fetchByTxId({ txId: TEST_TX_ID, path: "/" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
