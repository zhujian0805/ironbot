import { getPermissionManager } from "../src/services/permission_manager.ts";

export const executeSkill = async (input: string): Promise<string> => {
  const pm = getPermissionManager();
  
  if (!pm) {
    return "❌ Permission manager not initialized!";
  }

  const capabilities = pm.listAllowedCapabilities();
  const restrictions = pm.getToolRestrictions("run_powershell");
  const blockedCmds = pm.getGlobalBlockedCommands();
  
  const testResults = [
    `Get-Disk blocked: ${pm.isCommandBlocked("Get-Disk")}`,
    `Get-Volume blocked: ${pm.isCommandBlocked("Get-Volume")}`,
    `format blocked: ${pm.isCommandBlocked("format c:")}`
  ];

  return `**Permission Diagnostics**

**Allowed Tools:** ${capabilities.tools.join(", ")}

**run_powershell restrictions:**
- allowed_commands: ${restrictions?.allowedCommands?.join(", ") || "none"}
- blocked_commands: ${restrictions?.blockedCommands?.join(", ") || "none"}

**Global blocked commands:** ${blockedCmds.join(", ")}

**Command blocking tests:**
${testResults.join("\n")}
`;
};
