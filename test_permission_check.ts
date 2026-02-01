// Quick diagnostic script to test permission blocking
const blockedCommands = [
  "rm -rf /",
  "del /f /s /q c:\\\\",
  "format",
  ":(){:|:&};:",
  "mkfs",
  "dd if=/dev/zero",
  "shutdown",
  "reboot",
  "halt",
  "init 0",
  "init 6"
];

const testCommand = "Get-Disk";
const lowerCmd = testCommand.toLowerCase().trim();

console.log(`Testing command: "${testCommand}"`);
console.log(`Lowercase: "${lowerCmd}"`);
console.log("\nChecking against blocked commands:");

let isBlocked = false;
for (const blocked of blockedCommands) {
  const matches = lowerCmd.includes(blocked.toLowerCase());
  console.log(`  "${blocked}" -> ${matches ? "BLOCKS" : "ok"}`);
  if (matches) isBlocked = true;
}

console.log(`\nResult: ${isBlocked ? "BLOCKED" : "ALLOWED"}`);
