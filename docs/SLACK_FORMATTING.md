# Slack Markdown Formatting Implementation

## Overview
All messages sent to Slack are now automatically formatted with Slack's markdown (mrkdwn) format to ensure proper display of formatted text, links, and other rich content.

## What Changed

### New Files
- **`src/utils/slack_formatter.ts`**: Utility module for converting standard markdown to Slack's mrkdwn format
- **`tests/unit/slack_formatter.test.ts`**: Comprehensive tests for the formatter
- **`docs/SLACK_FORMATTING.md`**: This documentation file

### Modified Files
- **`src/services/message_router.ts`**: 
  - Imports and uses `formatForSlack()` to format all messages before sending to Slack
  - Adds `mrkdwn: true` parameter to all `chat.postMessage` calls
- **`src/services/claude_processor.ts`**: Updated system prompt to guide Claude to generate well-formatted responses with headers, bold text, and code blocks

## Slack Markdown Format (mrkdwn)

Slack uses a simplified markdown format with these conventions:

| Element | Slack Format | Standard Markdown |
|---------|-------------|-------------------|
| Bold | `*text*` | `**text**` |
| Italic | `_text_` | `_text_` or `*text*` |
| Strikethrough | `~text~` | `~~text~~` |
| Code (inline) | `` `text` `` | `` `text` `` |
| Code (block) | `` ```text``` `` | `` ```text``` `` |
| Links | `<url\|text>` | `[text](url)` |
| Lists | `- item` or `• item` | `- item` |
| Quotes | `> text` | `> text` |

## Implementation Details

### Approach

The formatter uses a careful text processing approach inspired by production Slack bots:

1. **Safe escaping**: Preserves Slack's special tokens (`<@USER>`, `<#CHANNEL>`, `<url|label>`) while escaping other special characters
2. **Smart link conversion**: Only adds labels to links when the label differs from the URL
3. **Proper code block handling**: Ensures ``` delimiters are on their own lines
4. **Visual hierarchy**: Uses emojis for headers and separators for sections

### `formatForSlack(message: string): string`
The main function that ensures messages are properly formatted for Slack. It performs these conversions:

1. **Bold text**: Converts `**text**` → `*text*`
2. **Links**: Converts `[text](url)` → `<url|text>` (or just `<url>` if text matches URL)
3. **Headers**: Converts headers to bold with visual indicators:
   - `# Header` → `*🔷 Header*` (main heading)
   - `## Header` → `*📌 Header*` (sub heading)
   - `### Header` → `*📋 Header*` (section heading)
4. **List labels**: Makes common list prefixes bold (`Summary:`, `Results:`, etc.)
5. **Visual separators**: Adds lines before Summary sections
6. **Code blocks**: Ensures proper ``` formatting
7. **Preserves**: Inline code, italic, strikethrough, Slack tokens
8. **Enables**: `mrkdwn: true` parameter in all Slack API calls for proper rendering

### Usage Example

```typescript
import { formatForSlack } from "../utils/slack_formatter.ts";

// Before
const message = "Found **3 files** in [the docs](https://example.com).";

// After formatting
const slackMessage = formatForSlack(message);
// Result: "Found *3 files* in <https://example.com|the docs>."

// Send to Slack
await slackClient.chat.postMessage({
  channel: channelId,
  text: slackMessage
});
```

## Where Formatting is Applied

All outbound messages to Slack are formatted in `message_router.ts`:
await this.slackClient.chat.postMessage({
     channel,
     text: responseText,
     thread_ts: threadTs,
     mrkdwn: true  // Explicitly enable markdown formatting
   });
   ```

2. **Error messages** (line ~197):
   ```typescript
   const errorText = formatForSlack(`${responsePrefix}:x: ${errorMessage}`);
   await this.slackClient.chat.postMessage({
     channel,
     text: errorText,
     mrkdwn: true  // Explicitly enable markdown formatting
   }

2. **Error messages** (line ~197):
   ```typescript
   const errorText = formatForSlack(`${responsePrefix}:x: ${errorMessage}`);
   ```

## Testing

Run the formatter tests:
```bashheaders, and code blocks display correctly in Slack
3. **Visual hierarchy**: Headers use emojis (🔷📌📋) to create clear visual sections
4. **AI-friendly**: Claude is guided to generate well-structured responses with proper formatting
5. **Maintainable**: Single utility function ensures all formatting is consistent
6. **Explicit rendering**: The `mrkdwn: true` parameter ensures Slack properly renders the formatting

The test suite covers:
- Bold text conversion
- Link conversion
- Header conversion
- Mixed formatting
- Edge cases (empty strings, multiple formats)
- Real-world AI response scenarios

## Benefits

1. **Consistent formatting**: All messages use proper Slack markdown
2. **Better readability**: Bold text, links, and other formatting display correctly in Slack
3. **AI-friendly**: Claude can generate standard markdown which is automatically converted
4. **Maintainable**: Single utility function ensures all formatting is consistent

## Future Enhancements

Potential improvements for future versions:
- Support for Slack's Block Kit for richer layouts
- Emoji conversion (`:emoji:` format)
- Mention handling (`<@USERID>` format)
- Channel references (`<#CHANNELID>` format)
- Custom formatting rules per message type
