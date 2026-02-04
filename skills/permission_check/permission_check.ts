import { getPermissionManager } from "../../src/services/permission_manager.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

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

  // Collect loaded skills from workspace and state directories
  const workspaceSkillsDir = path.join(process.cwd(), "skills");
  const stateSkillsDir = path.join(process.env.IRONBOT_STATE_DIR || path.join(os.homedir(), ".ironbot"), "skills");

  const skillLocations = [
    { label: "workspace ./skills", directory: workspaceSkillsDir },
    { label: "~/.ironbot/skills", directory: stateSkillsDir }
  ];

  const loadedSkills: string[] = [];
  for (const { label, directory } of skillLocations) {
    try {
      const stats = await fs.stat(directory);
      if (!stats.isDirectory()) {
        continue;
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith("_")) continue;

        if (entry.isDirectory()) {
          try {
            await fs.access(path.join(directory, entry.name, "SKILL.md"));
            loadedSkills.push(
              `${entry.name} (directory, ${label})${pm.isSkillAllowed(entry.name) ? "" : ", blocked"}`
            );
          } catch {
            // Not a documented skill; still expose directory presence
            loadedSkills.push(
              `${entry.name} (directory, ${label})${pm.isSkillAllowed(entry.name) ? "" : ", blocked"}`
            );
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if ([".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
            const skillName = path.basename(entry.name, ext);
            loadedSkills.push(
              `${skillName} (file, ${label})${pm.isSkillAllowed(skillName) ? "" : ", blocked"}`
            );
          }
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        continue;
      }
      loadedSkills.push(`Error reading ${label}: ${err?.message ?? String(error)}`);
    }
  }

  return `🤖 **IronBot System Status**

**🛠️ Available Skills:**
${loadedSkills.map(skill => `• ${skill}`).join('\n')}

**🔧 Allowed Tools:** ${capabilities.tools.join(", ")}

**📋 Allowed Skills:** ${capabilities.skills.join(", ")}

**⚙️ Key Restrictions:**
• PowerShell: ${restrictions?.allowedCommands?.includes('*') ? 'All commands allowed' : restrictions?.allowedCommands?.join(", ") || 'None'}
• Blocked: ${blockedCmds.slice(0, 3).join(", ")}${blockedCmds.length > 3 ? ` (+${blockedCmds.length - 3} more)` : ''}

**💡 Pro Tips:**
• Use natural language to install skills: "install this skill: <url>"
• Ask me "what skills do you have?" anytime
• Skills are automatically loaded on restart

Need help with something specific? Just ask! 🚀`;
};
