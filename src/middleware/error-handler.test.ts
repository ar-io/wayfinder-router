import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  createErrorHandlerMiddleware,
  WayfinderError,
  ArnsResolutionError,
  ArnsConsensusMismatchError,
  VerificationError,
  GatewayError,
  NoHealthyGatewaysError,
} from "./error-handler.js";
import { createTestLogger, TEST_TX_ID } from "../test-helpers.js";

function createApp() {
  const logger = createTestLogger();
  const app = new Hono();

  app.onError(createErrorHandlerMiddleware(logger));

  // Routes that throw specific error types
  app.get("/arns-resolution", () => {
    throw new ArnsResolutionError("my-app", "Name not found");
  });

  app.get("/arns-consensus", () => {
    throw new ArnsConsensusMismatchError("my-app", ["txId-aaa", "txId-bbb"]);
  });

  app.get("/verification", () => {
    throw new VerificationError(
      TEST_TX_ID,
      "Hash mismatch",
      "expected-hash",
      "computed-hash",
    );
  });

  app.get("/gateway", () => {
    throw new GatewayError("gw-a.example.com", "Connection refused");
  });

  app.get("/gateway-custom-status", () => {
    throw new GatewayError("gw-b.example.com", "Bad request", 400);
  });

  app.get("/no-healthy", () => {
    throw new NoHealthyGatewaysError();
  });

  app.get("/wayfinder-error", () => {
    throw new WayfinderError("Custom error", 418, "CUSTOM_CODE");
  });

  app.get("/generic-error", () => {
    throw new Error("Something broke");
  });

  app.get("/ok", (c) => c.text("ok"));

  return app;
}

describe("error handler middleware", () => {
  const app = createApp();

  // --- ArnsResolutionError ---

  it("returns 404 for ArnsResolutionError", async () => {
    const res = await app.request("/arns-resolution");
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("ARNS_RESOLUTION_FAILED");
    expect(body.message).toBe("Name not found");
  });

  // --- ArnsConsensusMismatchError ---

  it("returns 502 with hint for ArnsConsensusMismatchError", async () => {
    const res = await app.request("/arns-consensus");
    expect(res.status).toBe(502);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("ARNS_CONSENSUS_MISMATCH");
    expect(body.arnsName).toBe("my-app");
    expect(body.hint).toContain("different transaction IDs");
  });

  // --- VerificationError ---

  it("returns 502 with hint for VerificationError", async () => {
    const res = await app.request("/verification");
    expect(res.status).toBe(502);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("VERIFICATION_FAILED");
    expect(body.txId).toBe(TEST_TX_ID);
    expect(body.hint).toContain("verification failed");
  });

  // --- GatewayError ---

  it("returns 502 for GatewayError (default status)", async () => {
    const res = await app.request("/gateway");
    expect(res.status).toBe(502);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("GATEWAY_ERROR");
    expect(body.message).toBe("Connection refused");
  });

  it("returns custom status code for GatewayError", async () => {
    const res = await app.request("/gateway-custom-status");
    expect(res.status).toBe(400);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("GATEWAY_ERROR");
  });

  // --- NoHealthyGatewaysError ---

  it("returns 503 with hint for NoHealthyGatewaysError", async () => {
    const res = await app.request("/no-healthy");
    expect(res.status).toBe(503);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("NO_HEALTHY_GATEWAYS");
    expect(body.hint).toContain("unavailable");
  });

  // --- Generic WayfinderError ---

  it("returns custom status and code for WayfinderError", async () => {
    const res = await app.request("/wayfinder-error");
    expect(res.status).toBe(418);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("CUSTOM_CODE");
    expect(body.message).toBe("Custom error");
  });

  // --- Non-WayfinderError (unexpected errors) ---

  it("returns 500 for unexpected non-Wayfinder errors", async () => {
    const res = await app.request("/generic-error");
    expect(res.status).toBe(500);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("An unexpected error occurred");
  });

  // --- Successful requests pass through ---

  it("does not interfere with successful responses", async () => {
    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
