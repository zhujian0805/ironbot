#!/usr/bin/env bun
/**
 * Windows Service Wrapper - Quick Deployment Test
 * Tests windows-service CLI commands
 */

import { spawnSync } from "child_process";

const commands = [
  { cmd: "windows-service install --help", desc: "Test install help" },
  { cmd: "windows-service status", desc: "Check current status" },
];

console.log("=== Windows Service Wrapper Deployment Test ===\n");

for (const { cmd, desc } of commands) {
  console.log(`\n📋 Test: ${desc}`);
  console.log(`Command: bun dist/main.js ${cmd}\n`);

  const args = cmd.split(" ");
  const result = spawnSync("bun", ["dist/main.js", ...args], {
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    console.error(`❌ Error: ${result.error.message}`);
  } else if (result.status !== 0) {
    console.warn(`⚠ Exit code: ${result.status}`);
  } else {
    console.log(`✓ Success`);
  }
}

console.log("\n=== End of Test ===");
