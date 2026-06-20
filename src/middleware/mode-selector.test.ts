import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createModeSelectorMiddleware } from "./mode-selector.js";
import type { RouterConfig, RouterMode } from "../types/index.js";

function createTestConfig(
  defaultMode: RouterMode = "proxy",
  allowOverride: boolean = true,
) {
  return {
    mode: {
      default: defaultMode,
      allowOverride,
    },
  } as RouterConfig;
}

function createApp(config: RouterConfig) {
  const app = new Hono();
  app.use("*", createModeSelectorMiddleware(config));
  // Return the selected mode so tests can inspect it
  app.get("/test", (c) => {
    const mode = c.get("routerMode");
    return c.json({ mode });
  });
  return app;
}

describe("mode selector middleware", () => {
  // --- default mode ---

  it("applies default mode when no query param is present", async () => {
    const app = createApp(createTestConfig("proxy"));
    const res = await app.request("/test");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("proxy");
  });

  it("applies route as default mode", async () => {
    const app = createApp(createTestConfig("route"));
    const res = await app.request("/test");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("route");
  });

  // --- override with query param (allowOverride=true) ---

  it("overrides to proxy via ?mode=proxy when allowOverride is true", async () => {
    const app = createApp(createTestConfig("route", true));
    const res = await app.request("/test?mode=proxy");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("proxy");
  });

  it("overrides to route via ?mode=route when allowOverride is true", async () => {
    const app = createApp(createTestConfig("proxy", true));
    const res = await app.request("/test?mode=route");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("route");
  });

  // --- invalid mode param ---

  it("ignores invalid mode param and keeps default", async () => {
    const app = createApp(createTestConfig("proxy", true));
    const res = await app.request("/test?mode=invalid");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("proxy");
  });

  it("ignores empty mode param and keeps default", async () => {
    const app = createApp(createTestConfig("route", true));
    const res = await app.request("/test?mode=");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("route");
  });

  // --- override disabled (allowOverride=false) ---

  it("ignores mode query param when allowOverride is false", async () => {
    const app = createApp(createTestConfig("proxy", false));
    const res = await app.request("/test?mode=route");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("proxy");
  });

  it("ignores mode=proxy override when allowOverride is false and default is route", async () => {
    const app = createApp(createTestConfig("route", false));
    const res = await app.request("/test?mode=proxy");
    const body = (await res.json()) as { mode: string };
    expect(body.mode).toBe("route");
  });

  // --- middleware does not block request ---

  it("returns 200 and passes through to the handler", async () => {
    const app = createApp(createTestConfig("proxy"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});
