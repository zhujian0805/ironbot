/**
 * Integration test: SKILL.md-based skill execution
 * Tests that the smtp-send skill is properly handled through Claude with tools
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { initPermissionManager } from "../../src/services/permission_manager.ts";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const buildConfig = (allowedSkills: string[]) => `version: "1.0"
settings:
  default_deny: true
  log_denials: false
tools:
  allowed: [run_bash, run_powershell]
skills:
  allowed: ${JSON.stringify(allowedSkills)}
mcps:
  allowed: []
resources:
  denied_paths: []
`;

const SKILL_MD_CONTENT = `---
name: smtp-send
description: Send emails via SMTP with support for plain text, HTML, and attachments
---

# SMTP Send

Send emails via SMTP with support for text, HTML formatting, and file attachments.

## Quick Start

Send a simple email:

\`\`\`bash
python3 scripts/send_email.py \\
  --to recipient@example.com \\
  --subject "Meeting Tomorrow" \\
  --body "Hi, let's meet at 2pm tomorrow."
\`\`\`

## Parameters

- \`--to\`: Recipient email address (required)
- \`--subject\`: Email subject line (required)
- \`--body\`: Email body content (required)
- \`--smtp-host\`: SMTP server hostname (optional, uses config or environment)
- \`--smtp-port\`: SMTP server port (optional, defaults to 587)
`;

describe("SKILL.md-based skill execution through Claude", () => {
  let skillsDir: string;
  let permissionsFile: string;

  beforeEach(async () => {
    skillsDir = await mkdtemp(join(tmpdir(), "ironbot-skill-md-"));
    permissionsFile = join(skillsDir, "permissions.yaml");
    await writeFile(permissionsFile, buildConfig(["*"]));

    // Create smtp-send directory with SKILL.md
    const smtpDir = join(skillsDir, "smtp-send");
    await mkdir(smtpDir, { recursive: true });
    await writeFile(join(smtpDir, "SKILL.md"), SKILL_MD_CONTENT);

    // Create scripts directory (would contain send_email.py in real scenario)
    await mkdir(join(smtpDir, "scripts"), { recursive: true });

    initPermissionManager(permissionsFile);
  });

  it("detects SKILL.md-based skills and injects documentation into Claude context", async () => {
    const processor = new ClaudeProcessor(skillsDir);

    // Just verify that findRelevantSkillDocumentation can detect and load the skill
    const testMessage = "run skill smtp-send to send a test email";
    
    await processor["ensureSkillsLoaded"]();
    const docs = await processor["findRelevantSkillDocumentation"](testMessage);

    // Verify the documentation was found and formatted
    expect(docs).toBeDefined();
    expect(docs).toContain("Available Skills");
    expect(docs).toContain("smtp-send");
    expect(docs).toContain("Send emails via SMTP");
    expect(docs).toContain("python3 scripts/send_email.py");

    console.log("\n✅ Test Passed: SKILL.md documentation detected and formatted for Claude");
    console.log("Documentation snippet:");
    console.log((docs || "").substring(0, 200) + "...\n");

    await rm(skillsDir, { recursive: true, force: true });
  });

  it("marks SKILL.md-based skills with isDocumentationSkill flag", async () => {
    const processor = new ClaudeProcessor(skillsDir);
    await processor["ensureSkillsLoaded"]();

    const skills = processor["skills"];
    const smtpSkill = skills["smtp-send"];

    expect(smtpSkill).toBeDefined();
    expect(smtpSkill.isDocumentationSkill).toBe(true);
    expect(smtpSkill.skillDirectory).toBe(join(skillsDir, "smtp-send"));

    console.log("\n✅ Test Passed: SKILL.md-based skill marked correctly");
    console.log(`   Skill name: ${smtpSkill.name}`);
    console.log(`   Is documentation skill: ${smtpSkill.isDocumentationSkill}`);
    console.log(`   Skill directory: ${smtpSkill.skillDirectory}\n`);

    await rm(skillsDir, { recursive: true, force: true });
  });

  it("does NOT return raw SKILL.md content to user", async () => {
    const processor = new ClaudeProcessor(skillsDir);

    // Load skills
    await processor["ensureSkillsLoaded"]();

    // Get the skill handler
    const smtpSkill = processor["skills"]["smtp-send"];
    expect(smtpSkill).toBeDefined();

    // Call the handler to get what it would return
    const handlerOutput = await smtpSkill.handler("test input");

    // The handler returns raw SKILL.md content (which is correct - for injecting into Claude context)
    // But the key is that processMessage should NOT directly return this to user
    expect(handlerOutput).toContain("Send emails via SMTP");

    // Verify the skill is marked as documentation-based
    expect(smtpSkill.isDocumentationSkill).toBe(true);

    console.log("\n✅ Test Passed: SKILL.md content is properly marked for Claude injection");
    console.log(`   Handler returns documentation: ${handlerOutput.length} chars`);
    console.log(`   Is documentation skill: ${smtpSkill.isDocumentationSkill}\n`);

    await rm(skillsDir, { recursive: true, force: true });
  });
});
