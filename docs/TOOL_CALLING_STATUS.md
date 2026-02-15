# Tool Calling Implementation Status

## Current State

The ironbot bot is running with Azure OpenAI configured as the LLM provider, but **full tool calling integration is not yet implemented**.

### What's Working:
- ✅ Service running with Azure OpenAI (gpt-5.1-codex-mini)
- ✅ Bot responds to user prompts
- ✅ Configuration system with multi-provider support
- ✅ Tool executor framework ready
- ✅ Skill system loaded and available

### What's Missing:
- ❌ Azure OpenAI API integration for tool calling
- ❌ Tool/function definitions sent to LLM
- ❌ LLM-driven tool selection and execution
- ❌ Tool results fed back to LLM for follow-up

## Current Behavior vs Expected Behavior

### Current (Without SDK Integration)
```
User:  "show all CPUs"
Bot:   "[Pi Agent - openai:gpt-5.1-codex-mini] Ready to process: 'show all CPUs'..."
```

### Expected (With Azure OpenAI Tool Calling)
```
User:  "show all CPUs"
Bot:   [Calls Azure OpenAI API with tools]
       [LLM decides to call run_powershell with command "Get-CimInstance Win32_Processor"]
       [Executes PowerShell command and gets output]
       [LLM processes results and responds with formatted CPU info]
       "Your system has 8 CPU cores from Intel Core i7-9700K..."
```

## Implementation Roadmap

### Phase 1: Azure OpenAI API Integration (Next)
```typescript
// Need to implement in processWithTools():
1. Create Azure OpenAI client with:
   - apiKey: this.apiKey
   - baseUrl: this.baseUrl
   - model: this.model

2. Define tools schema (convert ToolExecutor tools to OpenAI format)

3. Call API with:
   - messages: [system prompt + user message]
   - tools: [available tools schema]
   - tool_choice: "auto"

4. Handle response:
   - If tool_calls → execute tools → call API again
   - If text response → return to user
```

### Phase 2: Tool Execution Loop
- Iterate until LLM is done calling tools
- Execute each tool call
- Pass results back to LLM
- Continue conversation

### Phase 3: Error Handling & Edge Cases
- Handle API timeouts
- Manage conversation context limits
- Handle invalid tool calls
- Graceful fallbacks

## File References

**Implementation Location:**
- `src/services/pi_agent_processor.ts` - `processWithTools()` method (line ~231)

**Tool Execution Framework Already Available:**
- `src/services/tools.ts` - ToolExecutor class
- Available tools: run_powershell, run_bash, read_file, write_file, list_directory, etc.

**Configuration:**
- Azure OpenAI API Key: `config.llmProvider.openai.apiKey`
- Base URL: `config.llmProvider.openai.baseUrl`
- Model: `config.llmProvider.openai.model`

## Required Changes

1. **Install Azure OpenAI SDK**
   ```bash
   bun add @azure/openai
   ```

2. **Implement Azure OpenAI Client Initialization**
   - Create client in `processWithTools()`
   - Configure with credentials from config

3. **Add Tool Schema Conversion**
   - Convert internal tool definitions to OpenAI function format

4. **Implement Tool Calling Loop**
   - Call API with tools enabled
   - Detect tool_calls in response
   - Execute tools using ToolExecutor
   - Feed results back to API

5. **Add Tests**
   - Test tool detection by LLM
   - Test tool execution
   - Test multi-turn conversations with tools

## Example Expected Flow

```
User: "show all CPUs"

→ PiAgentProcessor.processMessage()
  → buildSystemPrompt() with available tools
  → Call Azure OpenAI API with:
    {
      messages: [{role: "user", content: "show all CPUs"}],
      tools: [{name: "run_powershell", description: "...", parameters: {...}}],
      tool_choice: "auto"
    }
  ← Receives: {tool_calls: [{name: "run_powershell", arguments: {...}}]}

→ Execute tool via ToolExecutor
  → PowerShell returns CPU info

→ Call API again with tool results
  ← Receives: {content: "Your system has..."}

→ Return final response to user
```

## Notes

- This is a proper LLM tool calling implementation where the **LLM decides which tools to use**
- Not hardcoded keyword matching
- Follows patterns similar to Claude Agent SDK
- Scalable to multiple tools and complex conversations
