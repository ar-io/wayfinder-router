#!/usr/bin/env bun
/**
 * Build script for Wayfinder Router binaries.
 *
 * On Windows, uses Bun.build() JS API to embed PE metadata
 * (product name, publisher, version, icon). On other platforms,
 * builds without metadata since ELF/Mach-O have no equivalent.
 *
 * Usage:
 *   bun run scripts/build.ts --target=bun-windows-x64
 *   bun run scripts/build.ts --target=bun-linux-x64
 */

const pkg = await Bun.file("package.json").json();
const version: string = pkg.version;

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg?.split("=")[1] ?? undefined;

if (!target) {
  console.error("Usage: bun run scripts/build.ts --target=<bun-target>");
  console.error(
    "  Targets: bun-windows-x64, bun-linux-x64, bun-linux-arm64, bun-darwin-x64, bun-darwin-arm64",
  );
  process.exit(1);
}

const isWindows = target.includes("windows");
const suffix = isWindows ? ".exe" : "";
const outfile = `./builds/wayfinder-router-${target.replace("bun-", "")}${suffix}`;

// Ensure output directory exists
await Bun.$`mkdir -p ./builds`;

type BunTarget =
  | "bun-windows-x64"
  | "bun-linux-x64"
  | "bun-linux-arm64"
  | "bun-darwin-x64"
  | "bun-darwin-arm64";

if (isWindows) {
  console.log(`Building ${target} with Windows metadata (v${version})...`);

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: target as BunTarget,
      outfile,
      windows: {
        title: "Wayfinder Router",
        publisher: "ar.io",
        version,
        description: "Lightweight proxy router for the ar.io network",
        copyright: `Copyright ${new Date().getFullYear()} ar.io`,
        icon: "./assets/icon.ico",
      },
    },
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }
} else {
  console.log(`Building ${target}...`);

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: target as BunTarget,
      outfile,
    },
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }
}

console.log(`Built: ${outfile}`);
