import { promises as fs } from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createWriteStream } from "node:stream";
import { pipeline } from "node:stream/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function installFromGitHub(skillUrl: string, skillName: string): Promise<string> {
  try {
    const skillsDir = path.join(process.cwd(), 'skills');
    const skillDir = path.join(skillsDir, skillName);

    // Clone the repository
    const cloneCommand = `git clone "${skillUrl}" "${skillDir}"`;
    await execAsync(cloneCommand);

    return `✅ Successfully installed skill "${skillName}" from GitHub\n📁 Location: ${skillDir}\n🔄 Please restart the bot to load the new skill.`;
  } catch (error) {
    return `❌ Failed to clone GitHub repository: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function installSkillFromZip(zipPath: string, skillName: string): Promise<string> {
  try {
    // Extract the skill (assuming it's a zip file)
    const skillsDir = path.join(process.cwd(), 'skills');
    const skillDir = path.join(skillsDir, skillName);

    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Extract zip using PowerShell (since we're on Windows)
    const extractCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${skillDir}" -Force`;
    await execAsync(`powershell -Command "${extractCommand}"`);

    // Check if SKILL.md exists, if not create a basic one
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    try {
      await fs.access(skillMdPath);
    } catch {
      // Create a basic SKILL.md if it doesn't exist
      const basicSkillMd = `# ${skillName}

This skill was installed from ClawHub.

## Usage
Provide input to execute this skill.

## Description
${skillName} skill downloaded from ClawHub.
`;
      await fs.writeFile(skillMdPath, basicSkillMd);
    }

    // Clean up temp file
    await fs.unlink(zipPath);

    return `✅ Successfully installed skill "${skillName}" as SKILL.md format\n📁 Location: ${skillDir}\n🔄 Please restart the bot to load the new skill.`;
  } catch (error) {
    return `❌ Failed to install skill from zip: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const executeSkill = async (input: string): Promise<string> => {
  try {
    // Smart URL extraction - automatically finds and extracts HTTP/HTTPS URLs from any text
    // Supports natural language commands like:
    // "install this skill: https://..."
    // "can you add https://... as a skill?"
    // "download from https://..."
    // "get skill: <https://...>"
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const urls = input.match(urlRegex);
    
    if (!urls || urls.length === 0) {
      return "❌ No valid URL found in your message. Please include a URL starting with http:// or https://\n\n" +
             "💡 Smart parsing supported! You can say things like:\n" +
             "  'install this skill: https://example.com'\n" +
             "  'can you add https://example.com as a skill?'\n" +
             "  'download the weather skill from https://example.com'\n" +
             "  'get skill: <https://example.com>'";
    }
    
    // Use the first URL found
    let skillUrl = urls[0];
    
    // Strip surrounding characters that might be added by chat platforms
    skillUrl = skillUrl.replace(/^["'<>]|["'<>]$/g, '');
    
    // Validate the URL
    try {
      new URL(skillUrl);
    } catch {
      return `❌ Invalid URL: ${skillUrl}`;
    }
    
    if (!skillUrl.startsWith('http')) {
      return "❌ Invalid URL. Must start with http:// or https://";
    }

    // Extract skill name from URL early, before any checks
    let skillNameFromUrl = 'downloaded-skill';
    try {
      const urlObj = new URL(skillUrl);
      const hostname = urlObj.hostname;
      const hasSlug = urlObj.searchParams.has('slug');
      const isClawHub = hostname.includes('clawdhub.com');
      
      if (isClawHub && hasSlug) {
        const slug = urlObj.searchParams.get('slug');
        if (slug) {
          skillNameFromUrl = slug;
        }
      } else {
        // Fallback for other URLs
        const urlParts = skillUrl.split('/');
        skillNameFromUrl = urlParts[urlParts.length - 1] || 'downloaded-skill';
        skillNameFromUrl = skillNameFromUrl.split('?')[0];
      }
    } catch (error) {
      // Fallback to original logic for malformed URLs
      const urlParts = skillUrl.split('/');
      skillNameFromUrl = urlParts[urlParts.length - 1] || 'downloaded-skill';
      skillNameFromUrl = skillNameFromUrl.split('?')[0];
    }

    // Check if it's a GitHub repository URL
    if (skillUrl.includes('github.com')) {
      return await installFromGitHub(skillUrl, skillNameFromUrl);
    }

    // Create temp directory for download
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Check if it's a ClawHub skill URL and try the auth download endpoint
    if (skillUrl.includes('clawhub.ai') && skillUrl.includes('/lxgicstudios/')) {
      const slug = skillUrl.split('/').pop();
      if (slug) {
        const authDownloadUrl = `https://auth.clawhub.com/api/v1/download?slug=${slug}`;
        console.log(`Trying ClawHub auth download: ${authDownloadUrl}`);
        try {
          const authResponse = await fetch(authDownloadUrl);
          if (authResponse.ok) {
            const contentType = authResponse.headers.get('content-type') || '';
            if (contentType.includes('application/zip') || contentType.includes('application/octet-stream') || contentType.includes('application/json')) {
              console.log(`Success! Downloading from ClawHub auth endpoint`);
              const downloadBuffer = await authResponse.arrayBuffer();
              const tempSkillPath = path.join(tempDir, `${skillNameFromUrl}.zip`);
              await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
              
              // Extract and install as SKILL.md format
              return await installSkillFromZip(tempSkillPath, skillNameFromUrl);
            }
          }
        } catch (error) {
          console.log(`ClawHub auth download failed: ${error}`);
        }
      }
    }

    // Download the skill file
    
    const tempSkillPath = path.join(tempDir, `${skillNameFromUrl}.zip`);

    console.log(`Downloading from: ${skillUrl}`);
    console.log(`Skill name: ${skillNameFromUrl}`);
    
    const response = await fetch(skillUrl);
    if (!response.ok) {
      return `❌ Failed to download skill: HTTP ${response.status} ${response.statusText}`;
    }

    // Check if it's actually a zip file
    const contentType = response.headers.get('content-type') || '';
    const contentDisposition = response.headers.get('content-disposition') || '';
    
    const buffer = await response.arrayBuffer();
    
    // If content-type suggests HTML, it might be a web page
    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(buffer);
      
      // Try common API patterns for downloading skills
      const apiUrls = [
        skillUrl.replace('/lxgicstudios/', '/api/download/lxgicstudios/'),
        skillUrl.replace('/lxgicstudios/', '/api/skills/lxgicstudios/') + '/download',
        skillUrl + '/download',
        skillUrl.replace('clawhub.ai', 'api.clawhub.ai') + '/download',
        `https://api.clawhub.ai/skills/lxgicstudios/weather-2/download`
      ];

      for (const apiUrl of apiUrls) {
        try {
          console.log(`Trying API URL: ${apiUrl}`);
          const apiResponse = await fetch(apiUrl);
          if (apiResponse.ok) {
            const contentType = apiResponse.headers.get('content-type') || '';
            if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
              console.log(`Success! Downloading from ${apiUrl}`);
              const downloadBuffer = await apiResponse.arrayBuffer();
              await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
              break;
            }
          }
        } catch (error) {
          console.log(`API URL ${apiUrl} failed: ${error}`);
        }
      }

      // If no API worked, check for download links in HTML
      const downloadMatch = html.match(/href="([^"]*(?:download|\.skill|\.zip)[^"]*)"/i);
      if (downloadMatch) {
        const downloadUrl = downloadMatch[1];
        console.log(`Found download link: ${downloadUrl}`);
        const downloadResponse = await fetch(downloadUrl.startsWith('http') ? downloadUrl : new URL(downloadUrl, skillUrl).href);
        if (!downloadResponse.ok) {
          return `❌ Failed to download skill file: HTTP ${downloadResponse.status} ${downloadResponse.statusText}`;
        }
        const downloadBuffer = await downloadResponse.arrayBuffer();
        await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
      } else {
        return `❌ Could not find an automatic download method for this skill.

**What I tried:**
- Direct download from the URL
- Common API endpoints for ClawHub skills
- GitHub repository downloads

**Manual installation options:**
1. **If this is a ClawHub skill**: Use the official ClawHub CLI:
   \`\`\`bash
   npm install -g clawhub
   clawhub install lxgicstudios/weather-2
   \`\`\`

2. **Download manually**: Visit ${skillUrl} and look for a download button or link

3. **GitHub repo**: If the skill has a GitHub repository, you can clone it:
   \`\`\`bash
   git clone <repo-url> skills/${skillNameFromUrl}
   \`\`\`

4. **Direct .skill file**: If you have a .skill file URL, use that instead:
   \`install https://example.com/skill.skill\`

The skill system supports both traditional .ts/.js files and directory-based skills with SKILL.md files.`;
      }
    } else {
      // Assume it's a direct download
      await fs.writeFile(tempSkillPath, new Uint8Array(buffer));
    }

    // Extract and install as SKILL.md format
    return await installSkillFromZip(tempSkillPath, skillNameFromUrl);

  } catch (error) {
    return `❌ Failed to install skill: ${error instanceof Error ? error.message : String(error)}`;
  }
};