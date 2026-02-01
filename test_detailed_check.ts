// Detailed test of all commands that might be blocked
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

const testCommands = [
  "Get-Disk",
  "Get-Volume",
  "Get-Partition",
  "format c:",
  "Format-Volume",
  "shutdown /s"
];

console.log("Testing command blocking logic:\n");

for (const testCmd of testCommands) {
  const lowerCmd = testCmd.toLowerCase().trim();
  console.log(`Command: "${testCmd}"`);
  console.log(`  Lowercase: "${lowerCmd}"`);
  
  let blocked = false;
  let matchedBy = "";
  
  for (const blockedCmd of blockedCommands) {
    if (lowerCmd.includes(blockedCmd.toLowerCase())) {
      blocked = true;
      matchedBy = blockedCmd;
      break;
    }
  }
  
  console.log(`  Result: ${blocked ? `BLOCKED by "${matchedBy}"` : "ALLOWED"}`);
  console.log();
}
