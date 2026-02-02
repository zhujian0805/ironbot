import { getPermissionManager } from "../src/services/permission_manager.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
export const executeSkill = async (input) => {
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
    // Get loaded skills by checking the skills directory
    let loadedSkills = [];
    try {
        const skillsDir = path.join(process.cwd(), 'skills');
        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith("_"))
                continue;
            if (entry.isDirectory()) {
                // Check if it's a skill directory with SKILL.md
                try {
                    await fs.access(path.join(skillsDir, entry.name, 'SKILL.md'));
                    if (pm.isSkillAllowed(entry.name)) {
                        loadedSkills.push(`${entry.name} (directory)`);
                    }
                    else {
                        loadedSkills.push(`${entry.name} (directory, blocked)`);
                    }
                }
                catch {
                    // Not a valid skill directory
                }
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
                    const skillName = path.basename(entry.name, ext);
                    if (pm.isSkillAllowed(skillName)) {
                        loadedSkills.push(`${skillName} (file)`);
                    }
                    else {
                        loadedSkills.push(`${skillName} (file, blocked)`);
                    }
                }
            }
        }
    }
    catch (error) {
        loadedSkills = [`Error reading skills directory: ${error}`];
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
