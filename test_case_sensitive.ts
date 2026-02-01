// Test case-sensitive blocking on Windows
const blockedCommands = [
  "format ",
  "format.com",
  "FORMAT ",
  "Format ",
  "diskpart"
];

const testCommands = [
  "Get-Disk",
  "Format-Table",
  "Format-List", 
  "format c:",
  "FORMAT C:",
  "Format C:",
  "diskpart",
  "DISKPART"
];

console.log("Case-sensitive blocking test (Windows behavior):\n");

for (const testCmd of testCommands) {
  const cmdToCheck = testCmd.trim(); // Case-sensitive on Windows
  
  let blocked = false;
  let matchedBy = "";
  
  for (const blockedCmd of blockedCommands) {
    if (cmdToCheck.includes(blockedCmd)) {
      blocked = true;
      matchedBy = blockedCmd;
      break;
    }
  }
  
  console.log(`Command: "${testCmd}"`);
  console.log(`  Result: ${blocked ? `BLOCKED by "${matchedBy}"` : "ALLOWED"}`);
  console.log();
}
