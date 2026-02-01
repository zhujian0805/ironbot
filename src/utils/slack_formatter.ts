/**
 * Utility functions for converting text to Slack markdown (mrkdwn) format
 * 
 * Slack's mrkdwn format differences from standard markdown:
 * - Bold: *text* (single asterisk)
 * - Italic: _text_ (underscore)
 * - Strikethrough: ~text~
 * - Code inline: `text`
 * - Code block: ```text```
 * - Links: <url|text> or just <url>
 * - Quotes: > prefix
 */

/**
 * Escapes special characters for Slack, preserving allowed angle-bracket tokens
 */
function escapeSlackMrkdwn(text: string): string {
  if (!text) return text;
  
  // Preserve Slack's special tokens like <@USER>, <#CHANNEL>, <http://url|label>
  const angleTokenRegex = /<[^>\n]+>/g;
  const parts: string[] = [];
  let lastIndex = 0;
  
  for (const match of text.matchAll(angleTokenRegex)) {
    const matchIndex = match.index ?? 0;
    // Escape the text before the token
    const before = text.slice(lastIndex, matchIndex);
    parts.push(before.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    
    // Keep the token as-is if it's a valid Slack token
    const token = match[0];
    const inner = token.slice(1, -1);
    const isValidToken = inner.startsWith("@") || inner.startsWith("#") || inner.startsWith("!") ||
                         inner.startsWith("http://") || inner.startsWith("https://") ||
                         inner.startsWith("mailto:") || inner.startsWith("tel:");
    parts.push(isValidToken ? token : token.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    
    lastIndex = matchIndex + token.length;
  }
  
  // Escape remaining text
  parts.push(text.slice(lastIndex).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  return parts.join("");
}

/**
 * Converts standard markdown to Slack's mrkdwn format
 * @param text - The text to format
 * @returns Text formatted with Slack markdown
 */
export function toSlackMarkdown(text: string): string {
  if (!text) return text;

  let formatted = text;

  // Convert standard markdown bold (**text**) to Slack bold (*text*)
  // Handle nested/overlapping formatting carefully
  formatted = formatted.replace(/\*\*([^*]+?)\*\*/g, "*$1*");

  // Convert markdown links [text](url) to Slack links <url|text>
  // Only if the text differs from the URL
  formatted = formatted.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (match, linkText, url) => {
    const trimmedText = linkText.trim();
    const trimmedUrl = url.trim();
    // If link text is same as URL or URL without protocol, just use URL
    if (trimmedText === trimmedUrl || trimmedUrl.endsWith(trimmedText)) {
      return `<${trimmedUrl}>`;
    }
    return `<${trimmedUrl}|${trimmedText}>`;
  });

  // Handle headers - convert to bold with visual indicators
  // Process from most specific (###) to least specific (#) to avoid double-processing
  formatted = formatted.replace(/###\s+(.+?)(?:\n|$)/g, "*📋 $1*\n");
  formatted = formatted.replace(/##\s+(.+?)(?:\n|$)/g, "*📌 $1*\n");
  formatted = formatted.replace(/#\s+(.+?)(?:\n|$)/g, "*🔷 $1*\n");

  // Improve list formatting - make list labels bold
  formatted = formatted.replace(/^-\s+(Summary|Results|Note|Important|Warning|Details):/gm, "- *$1:*");
  
  // Add visual separator before Summary section for better readability
  formatted = formatted.replace(/\n\n-\s+\*Summary:\*/g, "\n\n─────────────────────\n- *Summary:*");

  // Ensure code blocks are properly formatted
  // Slack needs ``` on its own line
  formatted = formatted.replace(/```(\w*)\n/g, "```\n");

  return formatted;
}

/**
 * Ensures a message is properly formatted for Slack
 * @param message - The message to format
 * @returns Formatted message ready for Slack
 */
export function formatForSlack(message: string): string {
  return toSlackMarkdown(message);
}
