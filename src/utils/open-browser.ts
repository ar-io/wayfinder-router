/**
 * Cross-platform browser opener
 * Auto-opens a URL in the user's default browser on startup.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Logger } from "../types/index.js";

export function openInBrowser(url: string, logger?: Logger): void {
  // Skip in CI, Docker, or non-interactive environments
  if (process.env.CI) return;
  if (existsSync("/.dockerenv")) return;
  if (!process.stdout.isTTY) return;

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    logger?.debug("Could not open browser", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
