# Fix for SKILL.md-Based Skill Handling Bug

## Problem Summary

When a user asked the bot to run a SKILL.md-based skill (like `smtp-send`), the bot would return the raw SKILL.md markdown content instead of actually executing the skill.

### Example of the Bug
**User:** "run skill smtp-send to send a test email to jzhu@blizzard.com, use the MTA server: 10.63.6.154"

**Bot Response (WRONG):**
```
**Skill: smtp-send**

---
name: smtp-send
description: Send emails via SMTP...
---

# SMTP Send
Send emails via SMTP with support for text, HTML formatting...
```

**Expected Behavior:**
The bot should execute the Python script (`scripts/send_email.py`) with appropriate parameters to actually send the email.

## Root Cause Analysis

### How Skills Are Loaded

The codebase supports two types of skills:

1. **Traditional Executable Skills**: `.ts`/`.js` files with an `executeSkill` function that performs the actual work
2. **SKILL.md-Based Skills**: Directory-based skills with a `SKILL.md` file that documents how to use the skill

### The Bug

In `skill_loader.ts` (lines 219-238), SKILL.md-based skills were being loaded with a handler that simply returns the SKILL.md content:

```typescript
const handler: SkillHandler = async (input: string) => {
  return `**Skill: ${skillName}**\n\n${skillMdContent}\n\n*Input:* ${input}`;
};
```

When auto-routing in `claude_processor.ts` detected phrases like "run skill smtp-send", it would:
1. Find the matching skill in the skill registry
2. Call the handler directly
3. Return the SKILL.md content to the user

This is fundamentally wrong because SKILL.md files are **documentation/instructions** for Claude, not the implementation itself. The actual implementation is in scripts (e.g., `scripts/send_email.py`).

## The Fix

### Changes Made

#### 1. Added `isDocumentationSkill` Flag to SkillInfo (`skill_loader.ts`)

```typescript
export interface SkillInfo {
  name: string;
  handler: SkillHandler;
  metadata?: SkillMetadata;
  triggers?: string[];
  isDocumentationSkill?: boolean; // NEW: Distinguishes SKILL.md-based skills
  skillDirectory?: string;         // NEW: Path to skill directory
}
```

Traditional skills are marked with `isDocumentationSkill: false`, while SKILL.md-based skills are marked with `isDocumentationSkill: true`.

#### 2. Modified Auto-Routing Logic (`claude_processor.ts`)

Changed two places where auto-routing happens:

**a) Content-based matching (lines 216-236):**
```typescript
if (bestMatch && (bestMatch.score >= 10 || ...)) {
  const skillInfo = bestMatch.skill;
  
  // NEW: Check if it's a documentation skill
  if (skillInfo.isDocumentationSkill) {
    logger.info({ skillName: skillInfo.name }, "Detected SKILL.md-based skill");
    return null; // Don't auto-execute, pass to Claude instead
  }
  
  // Execute traditional skills directly
  const result = await Promise.resolve(skillInfo.handler(userMessage));
  return result;
}
```

**b) Direct execution keyword matching (lines 246-263):**
```typescript
for (const skillInfo of Object.values(this.skills)) {
  if (trimmedMessage.includes(skillInfo.name)) {
    // NEW: Skip SKILL.md-based skills
    if (skillInfo.isDocumentationSkill) {
      return null; // Let Claude process it with tools
    }
    
    // Execute traditional skills
    const result = await Promise.resolve(skillInfo.handler(userMessage));
    return result;
  }
}
```

#### 3. Added `findRelevantSkillDocumentation` Method (`claude_processor.ts`, lines 307-359)

This new method:
1. Scans the user message for mentions of SKILL.md-based skills
2. Calls the handler to retrieve the SKILL.md content
3. Formats it as documentation for Claude's system prompt

```typescript
private async findRelevantSkillDocumentation(userMessage: string): Promise<string | null> {
  // Find SKILL.md-based skills that match the message
  for (const skillInfo of Object.values(this.skills)) {
    if (skillInfo.isDocumentationSkill) {
      if (lowerMessage.includes(skillInfo.name.toLowerCase())) {
        relevantSkills.push(skillInfo);
      }
    }
  }
  
  // Get documentation content and format it
  return `\n\n## Available Skills\n\nYou have access to the following skills. Use the appropriate system tools (run_bash, run_powershell, etc.) to execute the scripts described in these skills:\n\n${validDocs.join("\n\n---\n\n")}`;
}
```

#### 4. Injected Skill Documentation into System Prompt (`claude_processor.ts`, lines 385-399)

Modified `processWithTools` to include skill documentation in the system prompt:

```typescript
private async processWithTools(...) {
  // NEW: Check for relevant SKILL.md documentation
  const relevantSkillDocs = await this.findRelevantSkillDocumentation(userMessage);
  
  let systemPrompt = SYSTEM_PROMPT;
  if (relevantSkillDocs) {
    systemPrompt = `${SYSTEM_PROMPT}\n\n${relevantSkillDocs}`;
  }
  if (memoryContext) {
    systemPrompt = `${systemPrompt}\n\nRelevant memory:\n${memoryContext}\n\nUse this context if it helps answer the user.`;
  }
  
  // Claude now has the skill instructions in its context
  // and can use tools like run_bash to execute the scripts
}
```

## How It Works Now

### New Flow for SKILL.md-Based Skills

1. **User Message:** "run skill smtp-send to send a test email to jzhu@blizzard.com"
2. **Auto-Routing Check:** Detects "smtp-send" but sees `isDocumentationSkill: true`
3. **Returns null:** Auto-routing returns null to skip direct execution
4. **processWithTools Called:** Normal LLM processing begins
5. **findRelevantSkillDocumentation:** Detects "smtp-send" in message, retrieves SKILL.md content
6. **System Prompt Enhanced:** SKILL.md content added to system prompt:
   ```
   You are a helpful AI assistant...
   
   ## Available Skills
   
   You have access to the following skills...
   
   **Skill: smtp-send**
   
   ---
   name: smtp-send
   description: Send emails via SMTP...
   ---
   
   ## Quick Start
   
   Send a simple email:
   ```bash
   python3 scripts/send_email.py \
     --to recipient@example.com \
     --subject "Meeting Tomorrow" \
     --body "Hi, let's meet at 2pm tomorrow."
   ```
   ```
7. **Claude Processes:** Claude reads the instructions and uses `run_bash` tool:
   ```json
   {
     "name": "run_bash",
     "input": {
       "command": "python3 scripts/send_email.py --to jzhu@blizzard.com --subject 'Test' --body 'Test email'",
       "working_directory": "./skills/smtp-send"
     }
   }
   ```
8. **Tool Executes:** Python script runs and sends the email
9. **Response to User:** "✅ Email sent successfully to jzhu@blizzard.com"

## Testing

### Unit Tests

Added test in `tests/unit/claude_processor.test.ts`:
```typescript
it("does NOT auto-route SKILL.md-based documentation skills, passes to Claude instead", async () => {
  // Verifies that:
  // 1. Handler is called once (to get documentation)
  // 2. Claude is called with skill docs in system prompt
  // 3. Tool executor runs the actual command
  // 4. Response contains execution results, not raw SKILL.md content
});
```

### Manual Testing

Created `test_smtp_skill.ts` to manually verify the fix works end-to-end.

## Impact

### What Changed
- SKILL.md-based skills (smtp-send, email-to-calendar, weather-2, yahoo-finance-clksb) now work correctly
- Claude can intelligently parse user requests and execute the appropriate scripts
- Better user experience - actual functionality instead of documentation dumps

### What Stayed the Same
- Traditional executable skills (skill_installer, permission_check) work exactly as before
- @skill references still work for direct skill invocation
- System prompt, memory, and tool execution unchanged

## Files Modified

1. **src/services/skill_loader.ts**
   - Added `isDocumentationSkill` and `skillDirectory` to `SkillInfo` interface
   - Marked traditional skills with `isDocumentationSkill: false`
   - Marked SKILL.md skills with `isDocumentationSkill: true`

2. **src/services/claude_processor.ts**
   - Modified auto-routing logic to skip SKILL.md-based skills
   - Added `findRelevantSkillDocumentation()` method
   - Modified `processWithTools()` to inject skill documentation into system prompt

3. **tests/unit/claude_processor.test.ts**
   - Added test case for SKILL.md-based skill handling

## Verification

Run the unit tests:
```bash
bunx vitest run tests/unit/claude_processor.test.ts
```

All tests should pass, including the new test for SKILL.md-based skills.

## Future Improvements

1. **Caching**: Cache SKILL.md content to avoid re-reading on every call
2. **Better Matching**: Use semantic search to find relevant skills instead of keyword matching
3. **Skill Parameters**: Parse SKILL.md to extract required parameters and validate user input
4. **Multi-Skill Scenarios**: Handle cases where multiple skills are mentioned in one message
