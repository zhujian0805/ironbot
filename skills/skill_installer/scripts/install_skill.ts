import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

let execAsync = promisify(exec);

export function overrideExecAsync(fn: (command: string) => Promise<unknown>) {
  execAsync = fn;
}

export function resetExecAsync() {
  execAsync = promisify(exec);
}

export function sanitizeSkillName(name: string): string {
  let sanitized = name
    .replace(/\.\./g, "")
    .replace(/[\/\\]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .substring(0, 50);

  if (!sanitized) {
    sanitized = "downloaded-skill";
  }

  return sanitized;
}

const getStateDir = () => process.env.IRONBOT_STATE_DIR || path.join(os.homedir(), ".ironbot");
const getStateSkillsDir = () => path.join(getStateDir(), "skills");
const getWorkspaceSkillsDir = () => path.join(process.cwd(), "skills");
const getTempDir = () => path.join(getStateDir(), "temp");

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureSkillsDir(): Promise<string> {
  const skillsDir = getStateSkillsDir();
  await ensureDir(skillsDir);
  return skillsDir;
}

async function ensureTempDir(): Promise<string> {
  const tempDir = getTempDir();
  await ensureDir(tempDir);
  return tempDir;
}

async function installFromGitHub(skillUrl: string, skillName: string): Promise<string> {
  try {
    console.log(`[skill_installer] Installing from GitHub: ${skillUrl}`);
    const skillsDir = await ensureSkillsDir();
    const skillDir = path.join(skillsDir, skillName);

    const gitProcess = spawn("git", ["clone", skillUrl, skillDir], {
      stdio: "inherit",
      cwd: process.cwd()
    });

    return new Promise<string>((resolve, reject) => {
      gitProcess.on("close", (code) => {
        if (code === 0) {
          resolve(
            `✅ Successfully installed skill "${skillName}" from GitHub\n📁 Location: ${skillDir}\n🔄 Please restart the bot to load the new skill.`
          );
        } else {
          reject(new Error(`Git clone failed with exit code ${code}`));
        }
      });

      gitProcess.on("error", (error) => {
        reject(error);
      });
    });
  } catch (error) {
    return `❌ Failed to clone GitHub repository: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function writeSkillMetadata(skillDir: string, skillName: string): Promise<void> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  try {
    await fs.access(skillMdPath);
  } catch {
    const basicSkillMd = `# ${skillName}

This skill was installed by the skill_installer helper.

## Usage
Provide input to execute this skill.

## Description
${skillName} skill downloaded from the installer.
`;
    await fs.writeFile(skillMdPath, basicSkillMd);
  }
}

async function installSkillFromZip(zipPath: string, skillName: string): Promise<string> {
  try {
    const skillsDir = await ensureSkillsDir();
    const skillDir = path.join(skillsDir, skillName);

    await ensureDir(skillDir);

    const extractCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${skillDir}" -Force`;
    await execAsync(`powershell -Command "${extractCommand}"`);

    await writeSkillMetadata(skillDir, skillName);
    await fs.unlink(zipPath);

    return `✅ Successfully installed skill "${skillName}" as SKILL.md format\n📁 Location: ${skillDir}\n🔄 Please restart the bot to load the new skill.`;
  } catch (error) {
    return `❌ Failed to install skill from zip: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function installFromGitHubTree(skillUrl: string, skillName: string): Promise<string> {
  try {
    console.log(`[skill_installer] Installing from GitHub tree URL: ${skillUrl}`);
    const parsed = new URL(skillUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const treeIndex = segments.findIndex((seg) => seg === "tree");
    if (treeIndex === -1 || treeIndex + 2 >= segments.length) {
      throw new Error("Tree URL missing branch or path");
    }

    const owner = segments[0];
    const repo = segments[1];
    const branch = segments[treeIndex + 1];
    const relativeSegments = segments.slice(treeIndex + 2);
    const skillsIndex = relativeSegments.findIndex((seg) => seg === "skills");

    if (skillsIndex === -1 || skillsIndex + 1 >= relativeSegments.length) {
      throw new Error("Tree URL does not point to a skills subdirectory");
    }

    const skillSegments = relativeSegments;
    const tempDir = await ensureTempDir();
    const cloneDir = path.join(tempDir, `${owner}-${repo}-${branch}`);

    await fs.rm(cloneDir, { recursive: true, force: true });
    console.log(`[skill_installer] Cloning https://github.com/${owner}/${repo}.git --branch ${branch}`);
    await execAsync(`git clone --depth 1 --branch "${branch}" https://github.com/${owner}/${repo}.git "${cloneDir}"`);

    const srcSkillDir = path.join(cloneDir, ...skillSegments);
    const skillsDir = await ensureSkillsDir();
    const targetDir = path.join(skillsDir, skillName);

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.cp(srcSkillDir, targetDir, { recursive: true });

    console.log(`[skill_installer] Copied ${srcSkillDir} to ${targetDir}`);
    await writeSkillMetadata(targetDir, skillName);

    await fs.rm(cloneDir, { recursive: true, force: true });
    return `✅ Successfully installed "${skillName}" from GitHub subdirectory\n📁 Location: ${targetDir}\n🔄 Please restart the bot to load the new skill.`;
  } catch (error) {
    return `❌ Failed to install skill from GitHub tree URL: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function gatherSkillDirectories(): Promise<Array<{ name: string; label: string }>> {
  const dirs: Array<{ path: string; label: string }> = [
    { path: getStateSkillsDir(), label: "~/.ironbot/skills" },
    { path: getWorkspaceSkillsDir(), label: "workspace" }
  ];

  const results: Array<{ name: string; label: string }> = [];
  for (const { path: dirPath, label } of dirs) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const directories = entries.filter((entry) => entry.isDirectory());
      for (const entry of directories) {
        results.push({ name: entry.name, label });
      }
    } catch {
      // ignore missing directories
    }
  }

  return results;
}

export async function listInstalledSkills(): Promise<string> {
  console.log("[skill_installer] listInstalledSkills scanning ~/.ironbot/skills and workspace ./skills");
  const entries = await gatherSkillDirectories();
  if (!entries.length) {
    console.log("[skill_installer] listInstalledSkills found no entries");
    return "No skills found in ~/.ironbot/skills or workspace ./skills.";
  }

  const lines = entries.map((entry) => `• ${entry.name} (from ${entry.label})`);
  console.log(`[skill_installer] listInstalledSkills found ${lines.length} entries`);
  return `Installed skills:\n${lines.join("\n")}`;
}

export async function removeInstalledSkill(skillName: string): Promise<string> {
  const sanitized = sanitizeSkillName(skillName);
  console.log(`[skill_installer] removeInstalledSkill requested for "${skillName}" (sanitized: "${sanitized}")`);
  const candidates = [
    { path: path.join(getStateSkillsDir(), sanitized), label: "~/.ironbot/skills" },
    { path: path.join(getWorkspaceSkillsDir(), sanitized), label: "workspace ./skills" }
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate.path);
      if (stats.isDirectory()) {
        console.log(`[skill_installer] Removing skill ${sanitized} from ${candidate.path} (${candidate.label})`);
        await fs.rm(candidate.path, { recursive: true, force: true });
        console.log(`[skill_installer] Removed skill "${sanitized}" from ${candidate.label}`);
        return `✅ Removed skill "${sanitized}" from ${candidate.label}`;
      }
    } catch {
      continue;
    }
  }

  console.log(`[skill_installer] removeInstalledSkill could not find "${sanitized}"`);
  return `❌ Skill "${sanitized}" not found in ~/.ironbot/skills or workspace ./skills.`;
}

export async function installSkill(input: string): Promise<string> {
  console.log(`[skill_installer] installSkill called with input: ${input}`);
  try {
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const urls = input.match(urlRegex);

    if (!urls || urls.length === 0) {
      return [
        "❌ No valid URL found in your message. Please include a URL starting with http:// or https://",
        "💡 Smart parsing supported! Try:",
        "  • install this skill: https://example.com",
        "  • can you add https://example.com as a skill?",
        "  • download the weather skill from https://example.com",
        "  • get skill: <https://example.com>"
      ].join("\n");
    }

    let skillUrl = urls[0].replace(/^["'<>]|["'<>]$/g, "");

    try {
      new URL(skillUrl);
    } catch {
      return `❌ Invalid URL: ${skillUrl}`;
    }

    if (!skillUrl.startsWith("http")) {
      return "❌ Invalid URL. Must start with http:// or https://";
    }

    let skillNameFromUrl = "downloaded-skill";
    try {
      const urlObj = new URL(skillUrl);
      const hostname = urlObj.hostname;
      const hasSlug = urlObj.searchParams.has("slug");
      const isClawHub = hostname.includes("clawdhub.com");

      if (isClawHub && hasSlug) {
        const slug = urlObj.searchParams.get("slug");
        if (slug) {
          skillNameFromUrl = slug;
        }
      } else {
        const urlParts = skillUrl.split("/");
        skillNameFromUrl = urlParts[urlParts.length - 1] || "downloaded-skill";
        skillNameFromUrl = skillNameFromUrl.split("?")[0];
      }
    } catch {
      const urlParts = skillUrl.split("/");
      skillNameFromUrl = urlParts[urlParts.length - 1] || "downloaded-skill";
      skillNameFromUrl = skillNameFromUrl.split("?")[0];
    }

    skillNameFromUrl = sanitizeSkillName(skillNameFromUrl);

    if (skillUrl.includes("github.com")) {
      if (skillUrl.includes("/tree/")) {
        return await installFromGitHubTree(skillUrl, skillNameFromUrl);
      }
      console.log(`[skill_installer] Detected GitHub URL, delegating to git clone`);
      return await installFromGitHub(skillUrl, skillNameFromUrl);
    }

    const tempDir = await ensureTempDir();
    const tempSkillPath = path.join(tempDir, `${skillNameFromUrl}.zip`);

    if (skillUrl.includes("clawhub.ai") && skillUrl.includes("/lxgicstudios/")) {
      const slug = skillUrl.split("/").pop();
      if (slug) {
        console.log(`[skill_installer] Detected ClawHub URL, attempting auth download for slug ${slug}`);
        const sanitizedSlug = sanitizeSkillName(slug);
        const authDownloadUrl = `https://auth.clawhub.com/api/v1/download?slug=${sanitizedSlug}`;
        try {
          const authResponse = await fetch(authDownloadUrl);
          if (authResponse.ok) {
            const contentType = authResponse.headers.get("content-type") || "";
            if (contentType.includes("application/zip") || contentType.includes("application/octet-stream") || contentType.includes("application/json")) {
              const downloadBuffer = await authResponse.arrayBuffer();
              await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
              return await installSkillFromZip(tempSkillPath, skillNameFromUrl);
            }
          }
        } catch {
          // Ignore and continue
        }
      }
    }

    const response = await fetch(skillUrl);
    if (!response.ok) {
      return `❌ Failed to download skill: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[skill_installer] Download response content-type: ${contentType}`);
    const buffer = await response.arrayBuffer();

    if (contentType.includes("text/html")) {
      console.log("[skill_installer] Content looks like HTML, trying API heuristics");
      const html = new TextDecoder().decode(buffer);
      const apiUrls = [
        skillUrl.replace("/lxgicstudios/", "/api/download/lxgicstudios/"),
        skillUrl.replace("/lxgicstudios/", "/api/skills/lxgicstudios/") + "/download",
        `${skillUrl}/download`,
        `${skillUrl.replace("clawhub.ai", "api.clawhub.ai")}/download`,
        "https://api.clawhub.ai/skills/lxgicstudios/weather-2/download"
      ];

      for (const apiUrl of apiUrls) {
        try {
          const apiResponse = await fetch(apiUrl);
          if (apiResponse.ok) {
            const contentType = apiResponse.headers.get("content-type") || "";
            if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
              const downloadBuffer = await apiResponse.arrayBuffer();
              await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
              return await installSkillFromZip(tempSkillPath, skillNameFromUrl);
            }
          }
        } catch {
          // Ignore and continue
        }
      }

      const downloadMatch = html.match(/href="([^"]*(?:download|\.skill|\.zip)[^"]*)"/i);
      if (downloadMatch) {
        const downloadUrl = downloadMatch[1];
        const downloadResponse = await fetch(downloadUrl.startsWith("http") ? downloadUrl : new URL(downloadUrl, skillUrl).href);
        if (!downloadResponse.ok) {
          return `❌ Failed to download skill file: HTTP ${downloadResponse.status} ${downloadResponse.statusText}`;
        }
        const downloadBuffer = await downloadResponse.arrayBuffer();
        await fs.writeFile(tempSkillPath, new Uint8Array(downloadBuffer));
        return await installSkillFromZip(tempSkillPath, skillNameFromUrl);
      }

      return `❌ Could not find an automatic download method for this skill. Please provide a direct ZIP, GitHub URL, or use ClawHub APIs as described in the documentation.`;
    }

    await fs.writeFile(tempSkillPath, new Uint8Array(buffer));
    return await installSkillFromZip(tempSkillPath, skillNameFromUrl);
  } catch (error) {
    return `❌ Failed to install skill: ${error instanceof Error ? error.message : String(error)}`;
  }
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "list") {
      console.log(await listInstalledSkills());
    } else if (command === "remove" && rest[0]) {
      console.log(await removeInstalledSkill(rest[0]));
    } else if (command === "install" && rest[0]) {
      console.log(await installSkill(rest[0]));
    } else {
      console.log(`
Usage:
  node skills/skill_installer/scripts/install_skill.ts install <url>   Install skill from URL
  node skills/skill_installer/scripts/install_skill.ts list              List installed skills
  node skills/skill_installer/scripts/install_skill.ts remove <name>    Remove an installed skill
`);
    }
  } catch (error) {
    console.error("CLI error:", error);
  }
}
